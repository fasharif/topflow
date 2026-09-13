'use client';

import { EMIRATE_LABELS, type AddressDto } from '@topflow/shared';
import { useState } from 'react';
import { AddressForm } from '@/components/account/address-form';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

type Editor = { mode: 'create' } | { mode: 'edit'; address: AddressDto } | null;
type BusyAction = 'default' | 'delete';

function AddressCard({
  address,
  busy,
  confirmingDelete,
  onEdit,
  onMakeDefault,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  address: AddressDto;
  busy: BusyAction | null;
  confirmingDelete: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <Card className={cx('flex flex-col', address.isDefault && 'border-brand-200')}>
      <div className="flex-1 space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate font-semibold text-ink-900">{address.label}</h2>
          {address.isDefault && <Badge tone="brand">Default</Badge>}
        </div>
        <address className="text-sm not-italic leading-relaxed text-slate-600">
          <span className="font-medium text-ink-900">{address.contactName}</span> · {address.phoneNumber}
          <br />
          {address.line1}
          {address.line2 && <>, {address.line2}</>}
          <br />
          {address.area}, {address.city}
          <br />
          {EMIRATE_LABELS[address.emirate]}
        </address>
      </div>

      <div className="border-t border-slate-100 px-5 py-3">
        {confirmingDelete ? (
          <div className="space-y-2">
            <p className="text-sm text-red-800">
              Delete this address?{address.isDefault && ' Your next saved address will become the default.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelDelete} disabled={busy === 'delete'}>
                Keep it
              </Button>
              <Button variant="danger" size="sm" loading={busy === 'delete'} onClick={onConfirmDelete}>
                Delete address
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit} disabled={busy !== null}>
              Edit<span className="sr-only"> {address.label}</span>
            </Button>
            {!address.isDefault && (
              <Button variant="ghost" size="sm" loading={busy === 'default'} disabled={busy !== null} onClick={onMakeDefault}>
                Make default
              </Button>
            )}
            <Button variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onRequestDelete} disabled={busy !== null}>
              Delete<span className="sr-only"> {address.label}</span>
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AddressesPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApiQuery<AddressDto[]>('/me/addresses');
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Hide a deleted card straight away instead of waiting for the reload to finish.
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const addresses = (data ?? []).filter((address) => !removedIds.includes(address.id));
  const firstAddress = addresses.length === 0;

  const resetMessages = () => {
    setNotice(null);
    setActionError(null);
  };

  const openEditor = (next: Editor) => {
    resetMessages();
    setConfirmDeleteId(null);
    setEditor(next);
  };

  const handleSaved = (address: AddressDto) => {
    setNotice(editor?.mode === 'edit' ? `“${address.label}” has been updated.` : `“${address.label}” has been added to your address book.`);
    setEditor(null);
    reload();
  };

  const makeDefault = async (address: AddressDto) => {
    resetMessages();
    setBusy({ id: address.id, action: 'default' });
    try {
      await api<AddressDto>(`/me/addresses/${address.id}`, { method: 'PATCH', body: { isDefault: true } });
      setNotice(`“${address.label}” is now your default delivery address.`);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (address: AddressDto) => {
    resetMessages();
    setBusy({ id: address.id, action: 'delete' });
    try {
      await api<void>(`/me/addresses/${address.id}`, { method: 'DELETE' });
      setRemovedIds((ids) => [...ids, address.id]);
      setConfirmDeleteId(null);
      setNotice(`“${address.label}” has been deleted.`);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Addresses"
        description="Save the places you get deliveries to and pick one in a click at checkout."
        actions={
          data && addresses.length > 0 && editor?.mode !== 'create' ? <Button onClick={() => openEditor({ mode: 'create' })}>Add address</Button> : undefined
        }
      />

      <div className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}

        {error ? (
          <Alert tone="danger" title="We couldn't load your addresses">
            <p>{error.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </Alert>
        ) : !data ? (
          <LoadingBlock label="Loading your addresses…" />
        ) : firstAddress && editor === null ? (
          <EmptyState
            title="No saved addresses yet"
            description="Add your home, office or project site once, then choose it at checkout."
            action={<Button onClick={() => openEditor({ mode: 'create' })}>Add an address</Button>}
          />
        ) : (
          <div aria-busy={loading} className={cx('grid gap-4 transition-opacity md:grid-cols-2', loading && 'opacity-70')}>
            {editor?.mode === 'create' && (
              <Card className="md:col-span-2">
                <CardHeader title="New address" description={firstAddress ? 'Your first address becomes your default delivery address.' : undefined} />
                <div className="p-5">
                  <AddressForm
                    defaults={{ contactName: user?.fullName ?? '', phoneNumber: user?.phoneNumber ?? '', label: firstAddress ? 'Home' : '', isDefault: firstAddress }}
                    firstAddress={firstAddress}
                    onSaved={handleSaved}
                    onCancel={() => setEditor(null)}
                  />
                </div>
              </Card>
            )}

            {addresses.map((address) =>
              editor?.mode === 'edit' && editor.address.id === address.id ? (
                <Card key={address.id} className="md:col-span-2">
                  <CardHeader title={`Edit “${address.label}”`} />
                  <div className="p-5">
                    <AddressForm address={address} onSaved={handleSaved} onCancel={() => setEditor(null)} />
                  </div>
                </Card>
              ) : (
                <AddressCard
                  key={address.id}
                  address={address}
                  busy={busy?.id === address.id ? busy.action : null}
                  confirmingDelete={confirmDeleteId === address.id}
                  onEdit={() => openEditor({ mode: 'edit', address })}
                  onMakeDefault={() => makeDefault(address)}
                  onRequestDelete={() => {
                    resetMessages();
                    setConfirmDeleteId(address.id);
                  }}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => remove(address)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
