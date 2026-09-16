'use client';

import { EMIRATE_LABELS, OrgPermission, type AddressDto } from '@topflow/shared';
import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { ConfirmAction, LoadError } from '@/components/business/feedback';
import { SiteForm } from '@/components/business/site-form';
import { useOrg } from '@/components/business/use-org';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

export default function SitesPage() {
  const { can } = useOrg();
  const canManage = can(OrgPermission.SITES_MANAGE);
  const sites = useApiQuery<AddressDto[]>('/org/addresses', { org: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaulting, setDefaulting] = useState<string | null>(null);

  const startEditing = (id: string) => {
    setEditing(id);
    setNotice(null);
    setError(null);
  };

  const saved = (site: AddressDto, created: boolean) => {
    setEditing(null);
    setNotice(created ? `“${site.label}” was added.` : `“${site.label}” was updated.`);
    sites.reload();
  };

  const makeDefault = async (site: AddressDto) => {
    setError(null);
    setDefaulting(site.id);
    try {
      await api<AddressDto>(`/org/addresses/${site.id}`, { method: 'PATCH', org: true, body: { isDefault: true } });
      setNotice(`“${site.label}” is now the default delivery site.`);
      sites.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDefaulting(null);
    }
  };

  const remove = async (site: AddressDto) => {
    setError(null);
    try {
      await api<void>(`/org/addresses/${site.id}`, { method: 'DELETE', org: true });
      setNotice(`“${site.label}” was removed.`);
      sites.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const list = sites.data ?? [];

  return (
    <div>
      <PageHeader
        title="Delivery sites"
        description={sites.data ? `${pluralize(list.length, 'site')} · choose one when you submit an RFQ.` : 'Project sites and yards we deliver to.'}
        actions={
          canManage && editing !== 'new' ? (
            <Button onClick={() => startEditing('new')}>
              <Plus aria-hidden="true" />
              Add delivery site
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        {!canManage && <Alert tone="info">Approvers and owners can add or change delivery sites.</Alert>}
      </div>

      {editing === 'new' && (
        <Card className="mb-6">
          <CardHeader title="New delivery site" description="Our drivers use the site contact to arrange access on delivery." />
          <div className="p-5">
            <SiteForm onSaved={(site) => saved(site, true)} onCancel={() => setEditing(null)} />
          </div>
        </Card>
      )}

      {sites.error ? (
        <LoadError error={sites.error} onRetry={sites.reload} />
      ) : !sites.data ? (
        <LoadingBlock label="Loading delivery sites…" />
      ) : list.length === 0 ? (
        editing !== 'new' && (
          <EmptyState
            icon={<MapPin aria-hidden="true" />}
            title="No delivery sites yet"
            description={
              canManage
                ? 'Add your project sites so buyers can pick them when requesting quotations.'
                : 'Ask an approver or owner to add your project sites.'
            }
            action={
              canManage ? (
                <Button onClick={() => startEditing('new')}>
                  <Plus aria-hidden="true" />
                  Add delivery site
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((site) =>
            editing === site.id ? (
              <li key={site.id} className="md:col-span-2">
                <Card>
                  <CardHeader title={`Edit ${site.label}`} />
                  <div className="p-5">
                    <SiteForm site={site} onSaved={(updated) => saved(updated, false)} onCancel={() => setEditing(null)} />
                  </div>
                </Card>
              </li>
            ) : (
              <li key={site.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex flex-1 items-start gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-flow-50 text-flow-700">
                      <MapPin aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="heading-4 text-ink-900">{site.label}</h2>
                        {site.isDefault && <Badge tone="brand">Default</Badge>}
                      </div>
                      <address className="mt-1 text-sm not-italic leading-relaxed text-slate-600">
                        {[site.line1, site.line2].filter(Boolean).join(', ')}
                        <br />
                        {site.area}, {site.city}, {EMIRATE_LABELS[site.emirate]}
                        <br />
                        <span className="text-slate-500">
                          {site.contactName} · {site.phoneNumber}
                        </span>
                      </address>
                    </div>
                  </div>
                  {canManage && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                      <Button size="sm" variant="secondary" onClick={() => startEditing(site.id)}>
                        Edit
                      </Button>
                      {!site.isDefault && (
                        <Button size="sm" variant="ghost" loading={defaulting === site.id} onClick={() => void makeDefault(site)}>
                          Make default
                        </Button>
                      )}
                      <span className="ml-auto">
                        <ConfirmAction label="Delete" confirmLabel="Delete" prompt="Delete this site?" variant="ghost" onConfirm={() => remove(site)} />
                      </span>
                    </div>
                  )}
                </Card>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
