import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Select } from 'antd'
import { useEffect, useState } from 'react'
import { getPublishedSurveyImage, type PublishedSurveySummary } from './ownerSurveyResultApi'
import { SurveyMutationError } from './SurveyMutationError'

export function PublishedSurveyImagePicker({ token, tenantId, summary, imageIds, label, initialImageId }: {
  token: string; tenantId: string; summary: PublishedSurveySummary; imageIds: string[]; label: string; initialImageId?: string
}) {
  const [imageId, selectImage] = useState(initialImageId)
  const [src, setSrc] = useState<{ imageId: string; url: string } | null>(null)
  const [failedUrl, setFailedUrl] = useState<string>()
  const image = useQuery({
    queryKey: ['owner-published-image', tenantId, summary.orderId, summary.publicationId, imageId],
    queryFn: ({ signal }) => getPublishedSurveyImage(token, summary.orderId, imageId!, signal),
    enabled: !!imageId, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (!imageId || !image.data) return
    const url = URL.createObjectURL(image.data)
    setSrc({ imageId, url })
    return () => URL.revokeObjectURL(url)
  }, [image.data, imageId])

  return <>
    {imageIds.length > 1 || !initialImageId ? <Select aria-label={`Chọn ${label.toLowerCase()}`} placeholder="Chọn ảnh để xem"
      value={imageId} onChange={selectImage} options={imageIds.map((id, index) => ({ value: id, label: `Ảnh ${index + 1}` }))}
      style={{ minWidth: 190 }} /> : null}
    {imageId && image.isFetching ? <p>Đang tải ảnh…</p> : null}
    <SurveyMutationError error={image.error} />
    {image.isError ? <Button onClick={() => { void image.refetch() }}>Tải lại ảnh</Button> : null}
    {imageId && src?.imageId === imageId && image.isSuccess ? (failedUrl === src.url
      ? <Alert className="workflow-notice" showIcon type="warning" title="Trình duyệt chưa hiển thị được ảnh này." />
      : <img className="workflow-notice" src={src.url} alt={label} onError={() => setFailedUrl(src.url)}
        style={{ display: 'block', maxWidth: '100%', maxHeight: 620 }} />) : null}
  </>
}
