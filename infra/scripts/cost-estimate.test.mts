import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  findPrice,
  formatReport,
  monthlyCost,
  OFFERS,
  pricesFrom,
  readEnvironment,
  type EnvironmentShape,
  type Offers,
  type PriceList,
} from './cost-estimate.mts';

const terraformRoot = fileURLToPath(new URL('../terraform', import.meta.url));

/** A regional offer file with one on-demand price per [family, usage type, price, region]. */
function offer(date: string, products: Array<[string | undefined, string, string, string?]>): PriceList {
  const list: PriceList = { publicationDate: `${date}T00:00:00Z`, products: {}, terms: { OnDemand: {} } };
  products.forEach(([family, usagetype, price, region = 'ap-south-1'], index) => {
    const sku = `SKU${index}`;
    list.products[sku] = { ...(family && { productFamily: family }), attributes: { usagetype, regionCode: region } };
    list.terms.OnDemand[sku] = { [`${sku}.TERM`]: { priceDimensions: { [`${sku}.DIM`]: { unit: 'Hrs', beginRange: '0', pricePerUnit: { USD: price } } } } };
  });
  return list;
}

const offers: Offers = {
  AmazonECS: offer('2026-09-11', [
    ['Compute', 'APS3-Fargate-vCPU-Hours:perCPU', '0.04'],
    ['Compute', 'APS3-Fargate-ARM-vCPU-Hours:perCPU', '0.03'],
    ['Compute', 'APS3-Fargate-Windows-vCPU-Hours:perCPU', '0.05'],
    ['Compute', 'APS3-Fargate-GB-Hours', '0.004'],
    ['Compute', 'APS3-Fargate-ARM-GB-Hours', '0.003'],
  ]),
  AWSELB: offer('2026-09-11', [
    ['Load Balancer-Application', 'APS3-LoadBalancerUsage', '0.02'],
    ['Load Balancer-Application', 'APS3-Outposts-LoadBalancerUsage', '0.5'],
    ['Load Balancer-Network', 'APS3-LoadBalancerUsage', '0.9'],
    ['Load Balancer-Application', 'APS3-LCUUsage', '0.01'],
  ]),
  AmazonVPC: offer('2026-09-17', [
    [undefined, 'APS3-PublicIPv4:InUseAddress', '0.005'],
    [undefined, 'APS3-PublicIPv4:IdleAddress', '0.005'],
  ]),
  awskms: offer('2026-09-11', [['Encryption Key', 'ap-south-1-KMS-Keys', '1']]),
  AmazonCloudWatch: offer('2026-09-22', [
    ['Alarm', 'APS3-CW:AlarmMonitorUsage', '0.1'],
    ['Data Payload', 'APS3-DataProcessing-Bytes', '0.5'],
    ['Storage Snapshot', 'APS3-TimedStorage-ByteHrs', '0.03'],
  ]),
};

const small: EnvironmentShape = { name: 'staging', apiTasks: 1, webTasks: 1, apiCpu: 256, apiMemory: 512, webCpu: 256, webMemory: 512, containerInsights: false };

describe('cost estimate', () => {
  it('picks the Linux x86 Fargate, Application Load Balancer and in-use IPv4 prices', () => {
    assert.deepEqual(pricesFrom(offers, 'ap-south-1'), {
      fargateVcpuHour: 0.04,
      fargateGbHour: 0.004,
      loadBalancerHour: 0.02,
      lcuHour: 0.01,
      publicIpv4Hour: 0.005,
      kmsKeyMonth: 1,
      alarmMonth: 0.1,
      logIngestionGb: 0.5,
      logStorageGbMonth: 0.03,
    });
  });

  it('refuses a missing or ambiguous price instead of guessing', () => {
    assert.throws(() => findPrice(offers.AmazonECS, 'eu-west-1', 'Compute', /-Fargate-GB-Hours$/), /found 0/);
    assert.throws(() => findPrice(offers.AmazonVPC, 'ap-south-1', undefined, /PublicIPv4/), /found 2/);
  });

  it('prices an environment idling at its minimum for 730 hours', () => {
    const lines = monthlyCost(small, pricesFrom(offers, 'ap-south-1'), { lcu: 1, logGb: 2 });
    const cost = Object.fromEntries(lines.map((line) => [line.item, Number(line.usd.toFixed(4))]));
    // 0.25 vCPU × 0.04 + 0.5 GB × 0.004 = 0.012 an hour
    assert.equal(cost['Fargate: API tasks'], 8.76);
    assert.equal(cost['Application Load Balancer'], 21.9);
    // two tasks and the load balancer's two addresses
    assert.equal(cost['Public IPv4 addresses'], 14.6);
    assert.equal(cost['CloudWatch alarms'], 0.9);
    assert.equal(cost['CloudWatch Logs'], 1.06);
  });

  it('reads task counts and sizes from the Terraform environments', () => {
    const staging = readEnvironment(terraformRoot, 'staging');
    const production = readEnvironment(terraformRoot, 'production');
    assert.deepEqual(
      [staging.apiTasks, staging.apiCpu, staging.apiMemory, staging.containerInsights],
      [1, 256, 512, false],
    );
    assert.deepEqual([production.apiTasks, production.webTasks, production.webMemory, production.containerInsights], [2, 2, 1024, true]);
    const main = readFileSync(join(terraformRoot, 'environments', 'staging', 'main.tf'), 'utf8');
    assert.match(main, /api_min_count\s+=\s+1/);
  });

  it('falls back to the module default when an environment does not set a value', () => {
    const root = mkdtempSync(join(tmpdir(), 'topflow-cost-'));
    try {
      mkdirSync(join(root, 'environments', 'lab'), { recursive: true });
      mkdirSync(join(root, 'modules', 'hub'), { recursive: true });
      writeFileSync(join(root, 'environments', 'lab', 'main.tf'), 'module "hub" {\n  api_min_count = 3\n  web_min_count = 1\n}\n');
      writeFileSync(
        join(root, 'modules', 'hub', 'variables.tf'),
        ['api_cpu', 'web_cpu'].map((name) => `variable "${name}" {\n  type    = number\n  default = 512\n}\n`).join('') +
          ['api_memory', 'web_memory'].map((name) => `variable "${name}" {\n  default = 1024\n}\n`).join('') +
          'variable "container_insights" {\n  default = false\n}\n',
      );
      assert.deepEqual(readEnvironment(root, 'lab'), { name: 'lab', apiTasks: 3, webTasks: 1, apiCpu: 512, apiMemory: 1024, webCpu: 512, webMemory: 1024, containerInsights: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports totals, assumptions, exclusions and the price list dates', () => {
    const prices = pricesFrom(offers, 'ap-south-1');
    const production = { ...small, name: 'production', apiTasks: 2, webTasks: 2, containerInsights: true };
    const report = formatReport(
      [small, production].map((env) => ({ env, lines: monthlyCost(env, prices, { lcu: 1, logGb: 1 }) })),
      offers,
      'ap-south-1',
      { lcu: 1, logGb: 1 },
    );
    assert.match(report, /^\| Item \| staging \| production \|$/m);
    assert.match(report, /^\| \*\*Total per month\*\* \| \*\*\d+\.\d\d\*\* \| \*\*\d+\.\d\d\*\* \|$/m);
    assert.match(report, /All environments together: \*\*\d+\.\d\d US dollars a month\*\*/);
    assert.match(report, /Not included: data transfer out of AWS/);
    assert.match(report, /Container Insights metrics \(production\)/);
    assert.match(report, new RegExp(`Price list files: ${OFFERS.map((code) => `${code} \\d{4}-\\d\\d-\\d\\d`).join(', ')}`));
  });
});
