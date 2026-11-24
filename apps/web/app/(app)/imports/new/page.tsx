import { redirect } from 'next/navigation';

/** The upload is a pop-up on the Imports page; old links land there with it open. */
export default function NewImportPage() {
  redirect('/imports?upload=1');
}
