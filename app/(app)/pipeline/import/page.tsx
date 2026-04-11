import { createClient } from '@/lib/supabase/server'
import { loadEntities } from '@/lib/pipeline/queries'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { ImportFlow } from './import-flow'

export const metadata = {
  title: 'Import Pipeline — Excel',
}

export default async function ImportPage() {
  const supabase = await createClient()
  const entities = await loadEntities(supabase, AUGUSTO_GROUP_ID)
  return <ImportFlow entities={entities} />
}
