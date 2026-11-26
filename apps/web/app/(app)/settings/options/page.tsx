import type { Metadata } from 'next';
import type { OptionListDto } from '@ph/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { OptionLists } from './OptionLists';

export const metadata: Metadata = { title: 'Product options' };

export default async function ProductOptionsSettingsPage() {
  const { data: lists } = await apiGet<{ data: OptionListDto[] }>('/option-lists');
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>Product options</CardTitle>
        <CardDescription>Sizes, colours and other lists you use often. Add one to a product in one click.</CardDescription>
      </CardHeader>
      <CardContent className="pt-2 sm:pt-2">
        <OptionLists lists={lists} />
      </CardContent>
    </Card>
  );
}
