'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { newId, type AttributeDraft } from './drafts';

type Props = {
  brand: string;
  onBrand: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  attributes: AttributeDraft[];
  onAttributes: (v: AttributeDraft[]) => void;
  /** Detail labels the business type suggests ("Material", "Generic name"). */
  suggestions: string[];
};

/** Brand, description and free details (label + value), folded away until the seller wants them. */
export function MoreOptions({ brand, onBrand, description, onDescription, attributes, onAttributes, suggestions }: Props) {
  const [open, setOpen] = useState(!!brand || !!description || attributes.length > 0);
  const add = (label = '') => onAttributes([...attributes, { id: newId(), label, value: '' }]);
  const update = (id: string, patch: Partial<AttributeDraft>) =>
    onAttributes(attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const free = suggestions.filter((s) => !attributes.some((a) => a.label.trim().toLowerCase() === s.toLowerCase()));
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <section className="flex flex-col gap-3">
      <Button type="button" variant="ghost" className="-ml-2 self-start px-2" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon className="h-4 w-4" aria-hidden />
        More options (brand, description, details)
      </Button>
      {open ? (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" maxLength={100} value={brand} onChange={(e) => onBrand(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" maxLength={1000} rows={3} value={description} onChange={(e) => onDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Details</span>
            {attributes.map((a, i) => (
              <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-2">
                <Input
                  aria-label={`Detail ${i + 1} label`}
                  placeholder="Material"
                  maxLength={60}
                  value={a.label}
                  onChange={(e) => update(a.id, { label: e.target.value })}
                />
                <Input
                  aria-label={`Detail ${i + 1} value`}
                  placeholder="Cotton"
                  maxLength={200}
                  value={a.value}
                  onChange={(e) => update(a.id, { value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove detail ${i + 1}`}
                  onClick={() => onAttributes(attributes.filter((x) => x.id !== a.id))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {free.map((s) => (
                <Button key={s} type="button" variant="secondary" size="sm" className="h-7 px-2" onClick={() => add(s)}>
                  + {s}
                </Button>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2"
                disabled={attributes.length >= 20}
                onClick={() => add()}
              >
                Add detail
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
