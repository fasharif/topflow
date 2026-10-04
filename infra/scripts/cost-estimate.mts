/**
 * Monthly cost estimate of the AWS layout in infra/terraform, from AWS's public price list (the
 * Price List bulk API: no account or credentials needed) and the task counts and sizes the
 * environments set in Terraform.
 *
 *   node infra/scripts/cost-estimate.mts [--region ap-south-1] [--lcu 1] [--log-gb 1] [--offers DIR]
 *
 * --offers reads saved regional offer files (<DIR>/<offer>.json) instead of downloading them.
 * The estimate is on-demand list prices for an environment idling at its auto scaling minimum; it is
 * not a bill. What it leaves out is listed in its output.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const HOURS_PER_MONTH = 730;
/** modules/hub/monitoring.tf; hub.tftest.hcl asserts the count. */
export const ALARMS_PER_ENVIRONMENT = 9;
/** An internet-facing load balancer in two availability zones holds one public address per zone. */
export const LOAD_BALANCER_ADDRESSES = 2;

export const OFFERS = ['AmazonECS', 'AWSELB', 'AmazonVPC', 'awskms', 'AmazonCloudWatch'] as const;
export type OfferCode = (typeof OFFERS)[number];

interface PriceDimension {
  unit: string;
  beginRange: string;
  pricePerUnit: { USD?: string };
}

/** The part of a regional offer file (https://pricing.us-east-1.amazonaws.com/...) this script reads. */
export interface PriceList {
  publicationDate: string;
  products: Record<string, { productFamily?: string; attributes: Record<string, string | undefined> }>;
  terms: { OnDemand: Record<string, Record<string, { priceDimensions: Record<string, PriceDimension> }>> };
}

export type Offers = Record<OfferCode, PriceList>;

/** On-demand price of the first tier of the one product in the region that matches. */
export function findPrice(list: PriceList, region: string, family: string | undefined, usage: RegExp): number {
  const matches = Object.entries(list.products).filter(
    ([, product]) =>
      (family === undefined || product.productFamily === family) &&
      usage.test(product.attributes.usagetype ?? '') &&
      (product.attributes.regionCode ?? region) === region,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one price for ${family ?? 'any family'} ${usage} in ${region}, found ${matches.length}.`);
  }
  const [sku] = matches[0]!;
  const dimensions = Object.values(list.terms.OnDemand[sku] ?? {}).flatMap((term) => Object.values(term.priceDimensions));
  const first = dimensions.find((dimension) => dimension.beginRange === '0');
  const price = Number(first?.pricePerUnit.USD);
  if (!first || !Number.isFinite(price)) throw new Error(`No on-demand price for ${usage} in ${region}.`);
  return price;
}

export interface Prices {
  fargateVcpuHour: number;
  fargateGbHour: number;
  loadBalancerHour: number;
  lcuHour: number;
  publicIpv4Hour: number;
  kmsKeyMonth: number;
  alarmMonth: number;
  logIngestionGb: number;
  logStorageGbMonth: number;
}

export function pricesFrom(offers: Offers, region: string): Prices {
  return {
    fargateVcpuHour: findPrice(offers.AmazonECS, region, 'Compute', /^[A-Z0-9]+-Fargate-vCPU-Hours:perCPU$/),
    fargateGbHour: findPrice(offers.AmazonECS, region, 'Compute', /^[A-Z0-9]+-Fargate-GB-Hours$/),
    loadBalancerHour: findPrice(offers.AWSELB, region, 'Load Balancer-Application', /^[A-Z0-9]+-LoadBalancerUsage$/),
    lcuHour: findPrice(offers.AWSELB, region, 'Load Balancer-Application', /^[A-Z0-9]+-LCUUsage$/),
    publicIpv4Hour: findPrice(offers.AmazonVPC, region, undefined, /^[A-Z0-9]+-PublicIPv4:InUseAddress$/),
    kmsKeyMonth: findPrice(offers.awskms, region, 'Encryption Key', /-KMS-Keys$/),
    alarmMonth: findPrice(offers.AmazonCloudWatch, region, 'Alarm', /^[A-Z0-9]+-CW:AlarmMonitorUsage$/),
    logIngestionGb: findPrice(offers.AmazonCloudWatch, region, 'Data Payload', /^[A-Z0-9]+-DataProcessing-Bytes$/),
    logStorageGbMonth: findPrice(offers.AmazonCloudWatch, region, 'Storage Snapshot', /^[A-Z0-9]+-TimedStorage-ByteHrs$/),
  };
}

export interface EnvironmentShape {
  name: string;
  apiTasks: number;
  webTasks: number;
  apiCpu: number;
  apiMemory: number;
  webCpu: number;
  webMemory: number;
  containerInsights: boolean;
}

/** A setting of an environment root (`name = value`), or the module's default for it. */
function setting(mainTf: string, variablesTf: string, name: string): string {
  const own = new RegExp(`^\\s*${name}\\s*=\\s*([^\\s#]+)`, 'm').exec(mainTf);
  if (own?.[1]) return own[1];
  const block = new RegExp(`variable "${name}" \\{[^}]*?default\\s*=\\s*([^\\s#]+)`, 's').exec(variablesTf);
  if (block?.[1]) return block[1];
  throw new Error(`${name} is set neither in the environment nor as a module default.`);
}

export function readEnvironment(terraformRoot: string, name: string): EnvironmentShape {
  const mainTf = readFileSync(join(terraformRoot, 'environments', name, 'main.tf'), 'utf8');
  const variablesTf = readFileSync(join(terraformRoot, 'modules', 'hub', 'variables.tf'), 'utf8');
  const number = (key: string) => {
    const value = Number(setting(mainTf, variablesTf, key));
    if (!Number.isFinite(value)) throw new Error(`${key} of ${name} is not a number.`);
    return value;
  };
  return {
    name,
    apiTasks: number('api_min_count'),
    webTasks: number('web_min_count'),
    apiCpu: number('api_cpu'),
    apiMemory: number('api_memory'),
    webCpu: number('web_cpu'),
    webMemory: number('web_memory'),
    containerInsights: setting(mainTf, variablesTf, 'container_insights') === 'true',
  };
}

export interface Assumptions {
  /** Average load balancer capacity units in use. */
  lcu: number;
  /** Log data ingested per environment and month, in GB. */
  logGb: number;
}

export interface CostLine {
  item: string;
  usage: string;
  usd: number;
}

const vcpu = (units: number) => units / 1024;
const gb = (mib: number) => mib / 1024;

export function monthlyCost(env: EnvironmentShape, prices: Prices, assumptions: Assumptions): CostLine[] {
  const task = (count: number, cpu: number, memory: number) =>
    count * HOURS_PER_MONTH * (vcpu(cpu) * prices.fargateVcpuHour + gb(memory) * prices.fargateGbHour);
  const addresses = env.apiTasks + env.webTasks + LOAD_BALANCER_ADDRESSES;
  return [
    { item: 'Fargate: API tasks', usage: `${env.apiTasks} × ${vcpu(env.apiCpu)} vCPU, ${gb(env.apiMemory)} GB`, usd: task(env.apiTasks, env.apiCpu, env.apiMemory) },
    { item: 'Fargate: web tasks', usage: `${env.webTasks} × ${vcpu(env.webCpu)} vCPU, ${gb(env.webMemory)} GB`, usd: task(env.webTasks, env.webCpu, env.webMemory) },
    {
      item: 'Application Load Balancer',
      usage: `${assumptions.lcu} LCU on average`,
      usd: HOURS_PER_MONTH * (prices.loadBalancerHour + assumptions.lcu * prices.lcuHour),
    },
    { item: 'Public IPv4 addresses', usage: `${addresses}: one per task, ${LOAD_BALANCER_ADDRESSES} for the load balancer`, usd: addresses * HOURS_PER_MONTH * prices.publicIpv4Hour },
    { item: 'KMS key', usage: '1', usd: prices.kmsKeyMonth },
    { item: 'CloudWatch alarms', usage: `${ALARMS_PER_ENVIRONMENT}`, usd: ALARMS_PER_ENVIRONMENT * prices.alarmMonth },
    {
      item: 'CloudWatch Logs',
      usage: `${assumptions.logGb} GB ingested and stored`,
      usd: assumptions.logGb * (prices.logIngestionGb + prices.logStorageGbMonth),
    },
  ];
}

const usd = (value: number) => value.toFixed(2);
const total = (lines: CostLine[]) => lines.reduce((sum, line) => sum + line.usd, 0);

export function formatReport(
  environments: Array<{ env: EnvironmentShape; lines: CostLine[] }>,
  offers: Offers,
  region: string,
  assumptions: Assumptions,
): string {
  const [first] = environments;
  if (!first) throw new Error('No environments to estimate.');
  const header = `| Item | ${environments.map(({ env }) => env.name).join(' | ')} |`;
  const rule = `| --- | ${environments.map(() => '---:').join(' | ')} |`;
  const rows = first.lines.map(
    (line, index) => `| ${line.item} | ${environments.map(({ lines }) => `${usd(lines[index]!.usd)} (${lines[index]!.usage})`).join(' | ')} |`,
  );
  const totals = `| **Total per month** | ${environments.map(({ lines }) => `**${usd(total(lines))}**`).join(' | ')} |`;
  const all = environments.reduce((sum, { lines }) => sum + total(lines), 0);
  const insights = environments.filter(({ env }) => env.containerInsights).map(({ env }) => env.name);
  return [
    `Estimated monthly cost in US dollars, on-demand list prices in ${region}, ${HOURS_PER_MONTH} hours a month, each environment idling at its auto scaling minimum.`,
    '',
    header,
    rule,
    ...rows,
    totals,
    '',
    `All environments together: **${usd(all)} US dollars a month**.`,
    '',
    `Assumptions: ${assumptions.lcu} load balancer capacity unit (LCU) on average, ${assumptions.logGb} GB of logs per environment and month.`,
    `Not included: data transfer out of AWS, the release step's task-minutes, S3 access logs, VPC flow logs of rejected traffic, KMS requests, DNS, and tasks added by auto scaling under load${
      insights.length > 0 ? `; Container Insights metrics (${insights.join(', ')}), billed per metric` : ''
    }.`,
    `Price list files: ${OFFERS.map((code) => `${code} ${offers[code].publicationDate.slice(0, 10)}`).join(', ')}.`,
  ].join('\n');
}

async function loadOffers(region: string, directory: string | undefined): Promise<Offers> {
  const entries = await Promise.all(
    OFFERS.map(async (code): Promise<[OfferCode, PriceList]> => {
      if (directory) return [code, JSON.parse(readFileSync(join(directory, `${code}.json`), 'utf8')) as PriceList];
      const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${code}/current/${region}/index.json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return [code, (await response.json()) as PriceList];
    }),
  );
  return Object.fromEntries(entries) as Offers;
}

function positive(name: string, value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a number of 0 or more, not "${value}".`);
  return number;
}

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      region: { type: 'string', default: 'ap-south-1' },
      lcu: { type: 'string', default: '1' },
      'log-gb': { type: 'string', default: '1' },
      offers: { type: 'string' },
    },
    strict: true,
  });
  const assumptions = { lcu: positive('--lcu', values.lcu), logGb: positive('--log-gb', values['log-gb']) };
  const terraformRoot = fileURLToPath(new URL('../terraform', import.meta.url));
  const offers = await loadOffers(values.region, values.offers);
  const prices = pricesFrom(offers, values.region);
  const environments = ['staging', 'production'].map((name) => {
    const env = readEnvironment(terraformRoot, name);
    return { env, lines: monthlyCost(env, prices, assumptions) };
  });
  console.log(formatReport(environments, offers, values.region, assumptions));
}

const invokedDirectly = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
