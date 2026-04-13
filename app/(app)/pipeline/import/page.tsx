import { createClient } from '@/lib/supabase/server'
import { loadPipelineEntities } from '@/lib/pipeline/queries'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { ImportFlow } from './import-flow'

export const metadata = {
  title: 'Import Pipeline — Excel',
}

export default async function ImportPage() {
  const supabase = await createClient()
  // Only expose pipeline entities to the import flow — this filters AGC / ENT
  // out of the entity code → ID map used to commit parsed rows, so any
  // AGC/ENT rows that slipped into the workbook cannot be imported.
  const entities = await loadPipelineEntities(supabase, AUGUSTO_GROUP_ID)
  return <ImportFlow entities={entities} />
}
