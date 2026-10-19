import { headers } from 'next/headers'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { headersOrigin, mcpServerUrl } from '@/lib/mcp/resource'
import SettingsContent from './SettingsContent'

/**
 * Settings is open to a **Guest**, so this resolves the **Account** a second time, as the boat
 * pages do (ADR 0018), for the one thing on it that is not: the **MCP Server**'s address. It is
 * built from the request's own origin, as the 401 challenge and the protected-resource metadata
 * build it, so a preview deployment shows its own. A Guest is handed no address at all.
 */
export default async function SettingsPage() {
  const account = await resolveAccount()
  const address = account ? mcpServerUrl(headersOrigin(await headers())) : null

  return <SettingsContent mcpServerUrl={address} />
}
