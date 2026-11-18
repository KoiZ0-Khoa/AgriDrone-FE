import { useQueries } from '@tanstack/react-query'
import { Alert, Image, Modal, Space, Spin } from 'antd'
import { getMissionMediaDownloadUrl } from '../missions/missionApi'
import type { FindingImages } from './healthReviewWorkflow'
import { healthReviewError, type FindingRow } from './healthReviewWorkflow'

// Ảnh bằng chứng của 1 phát hiện. Link xem do BE cấp mới mỗi lần (hiệu lực ngắn) qua .../media/{id}/download-url,
// nên không lưu link lâu dài và không bị chết như link ký sẵn 7 ngày trước đây.
const slots: { key: keyof FindingImages; title: string; hint: string }[] = [
  { key: 'annotated', title: 'Ảnh khoanh vùng', hint: 'Ảnh gốc có khung AI khoanh vùng nghi bệnh.' },
  { key: 'crop', title: 'Ảnh cắt', hint: 'Phóng to vùng phát hiện này.' },
  { key: 'source', title: 'Ảnh gốc drone', hint: 'Ảnh chụp chưa xử lý.' },
]

type Props = { token: string; farmId: string; missionId: string | null; missionError: unknown; row: FindingRow; close: () => void }

export function FindingImagesModal({ token, farmId, missionId, missionError, row, close }: Props) {
  const present = slots.filter(slot => row.images[slot.key])
  const urls = useQueries({
    queries: present.map(slot => ({
      queryKey: ['finding-image-url', missionId, row.images[slot.key]],
      queryFn: ({ signal }: { signal: AbortSignal }) => getMissionMediaDownloadUrl(token, farmId, missionId!, row.images[slot.key]!, signal),
      enabled: Boolean(missionId), retry: false, staleTime: 60_000, gcTime: 60_000,
    })),
  })
  return <Modal open title={`Ảnh phát hiện · ${row.className}`} footer={null} width={900} onCancel={close}>
    <p className="form-hint">{row.plantLabel} · độ tin cậy {row.confidence === null ? '—' : `${Math.round(row.confidence * 100)}%`} · {row.decisionLabel}</p>
    {!missionId ? missionError ? <Alert type="error" showIcon title="Không tìm thấy nhiệm vụ bay bệnh của đơn để lấy ảnh" description={healthReviewError(missionError)} />
      : <Spin /> : null}
    {missionId ? <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {present.map((slot, index) => {
        const query = urls[index]
        return <section key={slot.key}>
          <strong>{slot.title}</strong> <span className="form-hint">{slot.hint}</span>
          <div style={{ marginTop: 8 }}>
            {query.isPending ? <Spin />
              : query.isError ? <Alert type="error" showIcon title={`Không tải được ${slot.title.toLowerCase()}`} description={healthReviewError(query.error)} />
              : <Image src={query.data.downloadUrl} alt={slot.title} style={{ maxWidth: '100%', maxHeight: slot.key === 'annotated' ? 520 : 260, objectFit: 'contain' }} />}
          </div>
        </section>
      })}
    </Space> : null}
  </Modal>
}
