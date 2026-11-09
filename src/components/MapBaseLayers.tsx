import { LayersControl, TileLayer } from 'react-leaflet'

// Nền vệ tinh/OSM cho các bản đồ ảnh trực giao (nhiệm vụ bay, bản đồ sức khỏe cây) — học theo map_picker.py (lớp vệ tinh +
// OSM, chuyển được qua lại) nhưng dùng Esri World Imagery thay vì mt1.google.com: tile Google Maps không công khai cho
// dùng trực tiếp ngoài Google Maps JS API/billing, còn Esri World Imagery là nguồn ảnh vệ tinh miễn phí, không cần API key.
// Có lớp nền giúp phần đất trống quanh ảnh drone (bounds thường là hình chữ nhật bao quanh 1 vệt bay chéo/không đều)
// hiển thị đúng là bản đồ thật thay vì mảng xám trống.
export function MapBaseLayers() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Vệ tinh">
        {/* Esri chỉ đảm bảo phủ ảnh độ phân giải thật tới khoảng z17 ở hầu hết khu vực nông thôn (khác khu đô thị có thể cao hơn) —
            quá mức đó, nhiều vị trí (như vườn ở đây) trả về tile placeholder "Map data not yet available" thay vì ảnh thật.
            Giới hạn maxNativeZoom=17 để Leaflet ngừng xin tile vượt mức đó và tự phóng to tile z17 thật lên thay vì hiện placeholder. */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri, Maxar, Earthstar Geographics"
          maxZoom={22}
          maxNativeZoom={17}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="OpenStreetMap">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}
