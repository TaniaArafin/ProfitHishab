'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { OptionListDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';
import { ChipsInput } from '@/components/ChipsInput';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Editing = { id: string | null; name: string; values: string[] };

/** Spec §7: saved option lists. The product form copies one onto a product with one click. */
export function OptionLists({ lists }: { lists: OptionListDto[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setPending(true);
    const body = { name: editing.name, values: editing.values };
    const res = editing.id ? await api('PATCH', `/option-lists/${editing.id}`, body) : await api('POST', '/option-lists', body);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setEditing(null);
    refreshData(router);
  }

  async function remove(id: string) {
    const res = await api('DELETE', `/option-lists/${id}`);
    if (!res.ok) return setError(res.error);
    refreshData(router);
  }

  const form = editing ? (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-md border border-ink/10 p-3" noValidate>
      <div>
        <Label htmlFor="list-name">List name</Label>
        <Input id="list-name" maxLength={40} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        {fieldError(error, 'name') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'name')}</p> : null}
      </div>
      <div>
        <span className="text-sm font-medium">Values</span>
        <ChipsInput
          values={editing.values}
          onChange={(values) => setEditing({ ...editing, values })}
          groupLabel="List values"
          inputLabel="Add a value"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save list'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </form>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
      {lists.length === 0 && !editing ? <p className="text-sm text-ink-muted">No saved lists yet.</p> : null}
      <ul className="flex flex-col divide-y divide-line/60">
        {lists.map((l) =>
          editing?.id === l.id ? (
            <li key={l.id} className="py-3">
              {form}
            </li>
          ) : (
            <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.name}</div>
                <div className="truncate text-sm text-ink-muted">{l.values.length ? l.values.join(', ') : 'No values yet'}</div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" aria-label={`Edit ${l.name}`} onClick={() => setEditing({ ...l })}>
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="ghost" className="text-loss hover:text-loss" aria-label={`Delete ${l.name}`}>
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {l.name}?</AlertDialogTitle>
                      <AlertDialogDescription>Products that use these values keep them. Only the saved list goes.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep list</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void remove(l.id)}>Delete list</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing && editing.id === null ? form : null}
      {!editing ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setEditing({ id: null, name: '', values: [] })}>
          New option list
        </Button>
      ) : null}
    </div>
  );
}
