import { useState } from 'react'
import { Button } from 'antd'
import { useAuth } from '../features/auth/AuthContext'
import type { FarmDetail } from '../features/farms/types'
import { farmAction, type Action } from './actions'
import { ActionModal } from './ActionModal'
export function FarmEditButton({ farm }: { farm: FarmDetail }) {
  const { session } = useAuth()
  const [action, setAction] = useState<Action | null>(null)
  if (!session || !['OWNER', 'TENANT_ADMIN'].includes(session.role)) return null
  return <><Button onClick={() => setAction(farmAction(session.accessToken, farm.id, { ...farm, expectedVersion: farm.version }))}>Chỉnh sửa nông trại</Button>{action ? <ActionModal action={action} close={() => setAction(null)} /> : null}</>
}
