<template>
  <div class="flight-planner">
    <!-- 左侧面板 -->
    <div class="left-panel-wrapper">
      <RouteSettingsPanel
        :geojsonInput="geojsonInput"
        @update:geojsonInput="(val) => geojsonInput = val"
        :spacing="currentSpacing"
        @update:spacing="(val) => currentSpacing = val"
        :angle="currentAngle"
        @update:angle="(val) => currentAngle = val"
        :margin="currentMargin"
        @update:margin="(val) => currentMargin = val"
        :showPath="showPath"
        @update:showPath="(val) => showPath = val"
        :showWaypoints="showWaypoints"
        @update:showWaypoints="(val) => showWaypoints = val"
        :speed="currentSpeed"
        @update:speed="(val) => currentSpeed = val"
        :startPoint="startPoint"
        :endPoint="endPoint"
        :isPickingStart="isPickingStart"
        :isPickingEnd="isPickingEnd"
        :pickerStatus="pickerStatus"
        :isSimulating="isSimulating"
        :isDrawing="isDrawing"
        :drawingStatus="drawingStatus"
        :cameraWidth="props.cameraWidth"
        @toggle-pick-start="togglePickStart"
        @toggle-pick-end="togglePickEnd"
        @apply-geojson="applyGeojson"
        @toggle-draw="toggleDraw"
        @spacing-change="updateFlightPath"
        @angle-change="updateFlightPath"
        @margin-change="updateFlightPath"
        @show-path-change="handleShowPathChange"
        @show-waypoints-change="handleShowWaypointsChange"
        @simulate="simulateFlight"
        @export="exportGeojson"
      />
    </div>

    <!-- 地图类型控制 -->
    <div class="mapTypeControl">
      <button
        class="normalMap"
        :class="{ active: mapType === 'normal' }"
        @click="setMapType('normal')"
      >
        道路地图
      </button>
      <button
        class="satelliteMap"
        :class="{ active: mapType === 'satellite' }"
        @click="setMapType('satellite')"
      >
        影像地图
      </button>
    </div>

    <!-- 右下信息面板 -->
    <div class="rightBottomPanel">
      <div class="panel-section">
        <div class="panel-title">航线信息</div>
        <div class="info-item">
          <span>航线点数：</span>
          <span class="info-value pointCount">{{ flightData.path.length }}</span>
        </div>
        <div class="info-item">
          <span>航线间距：</span>
          <span class="info-value"><span class="spacing">{{ currentSpacing }}</span>米</span>
        </div>
        <div class="info-item">
          <span>航线总长：</span>
          <span class="info-value"><span class="totalLength">{{ totalLength.toLocaleString() }}</span>米</span>
        </div>
      </div>
    </div>

    <!-- 地图容器 -->
      <div id="container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  calculateDistance,
  calculatePathLength
} from '@/utils/flightPath'
import { httpClient } from '@/router/utils/http'
import RouteSettingsPanel from './RouteSettingsPanel.vue'

interface Props {
  cameraWidth?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  cameraWidth: null
})

// ========== 状态 ==========
const geojsonInput = ref<string>('')
const startPoint = ref<[number, number] | null>([116.352209, 39.867487])
const endPoint = ref<[number, number] | null>(null)
const isPickingStart = ref(false)
const isPickingEnd = ref(false)
const pickerStatus = ref('')
const currentSpacing = ref(350)
const currentAngle = ref(0)
const currentMargin = ref(0)
const showPath = ref(true)
const showWaypoints = ref(false)
const currentSpeed = ref(10)
const isSimulating = ref(false)
const mapType = ref<'normal' | 'satellite'>('normal')
const isDrawing = ref(false)
const drawingStatus = ref('')

// 地图相关
let map: any = null
let polygon: any = null
let flightLine: any = null
let startMarker: any = null
let endMarker: any = null
let droneMarker: any = null
let animationInterval: number | null = null
let currentPathIndex = 0
let satelliteLayer: any = null
type FlightOverlayType = 'line' | 'waypoint' | 'drone'
const flightOverlays: any[] = []

// 绘制相关
let drawingPoints: [number, number][] = []
let drawingPolyline: any = null
let drawingMarkers: any[] = []

// 航线数据
const path = ref<[number, number][]>([
  [116.362209, 39.887487],
  [116.422897, 39.878002],
  [116.392105, 39.90651],
  [116.372105, 39.91751],
  [116.362105, 39.93751],
  [116.362209, 39.887487]
])

const flightData = ref({
  path: [] as [number, number][],
  waypoints: [] as [number, number][]
})

const totalLength = ref(0)

// ========== 初始化 ==========
onMounted(() => {
  initMap()
  initDefaultGeojson()
  updateFlightPath()
  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  if (animationInterval) clearInterval(animationInterval)
  window.removeEventListener('resize', handleWindowResize)
})

// ========== 方法 ==========
function formatCoord(coord: [number, number]): string {
  return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`
}

function handleWindowResize() {
  try {
    if (map) {
      map.resize()
    }
  } catch (_) {}
}

function initMap() {
  if (!(window as any).AMap) {
    const script = document.createElement('script')
    script.src = 'https://webapi.amap.com/maps?v=2.0&key=a0c628a7cbe0de2e9ec5a3f548854b58&plugin=AMap.PolygonEditor'
    script.onload = () => {
      createMapInstance()
    }
    document.head.appendChild(script)
  } else {
    createMapInstance()
  }
}

function createMapInstance() {
  map = new (window as any).AMap.Map('container', {
    center: [116.395577, 39.892257],
    zoom: 14
  })

  polygon = new (window as any).AMap.Polygon({
    path: path.value,
    strokeColor: '#000000',
    strokeWeight: 2,
    fillColor: '#3366FF',
    fillOpacity: 0.3,
    zIndex: 50
  })
  map.add(polygon)

  map.on('click', handleMapClick)

  if (startPoint.value) {
    startMarker = createMarker(startPoint.value, '起飞点', true)
  }

  map.setFitView()
  // 初始化后强制一次重绘，避免偶发首次白屏
  try {
    map.resize()
  } catch (_) {}
}

function createMarker(position: [number, number], title: string, isStart: boolean) {
  return new (window as any).AMap.Marker({
    map: map,
    position,
    icon: new (window as any).AMap.Icon({
      size: new (window as any).AMap.Size(25, 34),
      image: 'https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png',
      imageSize: new (window as any).AMap.Size(25, 34)
    }),
    offset: new (window as any).AMap.Pixel(-13, -30),
    label: {
      content: `<div style="padding: 5px 10px; background-color: #fff; border: 2px solid #f00; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); font-size: 14px; font-weight: bold; color: #f00;">${title}</div>`,
      direction: 'right',
      offset: new (window as any).AMap.Pixel(20, 0)
    },
    zIndex: 110
  })
}

function handleMapClick(e: any) {
  const coords: [number, number] = [e.lnglat.getLng(), e.lnglat.getLat()]

  // 绘制模式
  if (isDrawing.value) {
    drawingPoints.push(coords)
    
    // 添加标记点
    const marker = new (window as any).AMap.Marker({
      position: coords,
      icon: new (window as any).AMap.Icon({
        size: new (window as any).AMap.Size(20, 20),
        image: 'https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png',
        imageSize: new (window as any).AMap.Size(20, 20)
      }),
      zIndex: 100
    })
    marker.setMap(map)
    drawingMarkers.push(marker)
    
    // 更新预览线
    if (drawingPoints.length > 1) {
      if (drawingPolyline) {
        drawingPolyline.setPath(drawingPoints)
      } else {
        drawingPolyline = new (window as any).AMap.Polyline({
          path: drawingPoints,
          strokeColor: '#FF6600',
          strokeWeight: 2,
          strokeStyle: 'dashed',
          zIndex: 99
        })
        drawingPolyline.setMap(map)
      }
    }
    
    drawingStatus.value = `已添加 ${drawingPoints.length} 个点，继续点击添加或点击"完成绘制"结束`
    return
  }

  // 原有的起飞点/降落点选择逻辑
  if (!isPickingStart.value && !isPickingEnd.value) return

  if (isPickingStart.value) {
    startPoint.value = coords
    if (startMarker) startMarker.setMap(null)
    startMarker = createMarker(coords, '起飞点', true)
    isPickingStart.value = false
    pickerStatus.value = ''
  } else if (isPickingEnd.value) {
    endPoint.value = coords
    if (endMarker) endMarker.setMap(null)
    endMarker = createMarker(coords, '降落点', false)
    isPickingEnd.value = false
    pickerStatus.value = ''
  }

  updateFlightPath()
}

function togglePickStart() {
  isPickingEnd.value = false
  if (isDrawing.value) {
    clearDrawing()
    isDrawing.value = false
    drawingStatus.value = ''
  }
  isPickingStart.value = !isPickingStart.value
  pickerStatus.value = isPickingStart.value ? '请在地图上点击选择起飞点位置' : ''
}

function togglePickEnd() {
  isPickingStart.value = false
  if (isDrawing.value) {
    clearDrawing()
    isDrawing.value = false
    drawingStatus.value = ''
  }
  isPickingEnd.value = !isPickingEnd.value
  pickerStatus.value = isPickingEnd.value ? '请在地图上点击选择降落点位置' : ''
}

function toggleDraw() {
  if (isDrawing.value) {
    // 完成绘制
    if (drawingPoints.length < 3) {
      alert('至少需要3个点才能构成多边形')
      return
    }
    
    // 闭合多边形（添加第一个点作为最后一个点）
    const firstPoint = drawingPoints[0]
    if (!firstPoint) return
    const closedPath: [number, number][] = [...drawingPoints, firstPoint]
    
    // 生成 GeoJSON
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [closedPath]
      }
    }
    
    geojsonInput.value = JSON.stringify(geojson, null, 2)
    
    // 应用 GeoJSON
    path.value = closedPath
    polygon.setPath(closedPath)
    updateFlightPath()
    map.setFitView()
    
    // 清理绘制状态
    clearDrawing()
    isDrawing.value = false
    drawingStatus.value = ''
  } else {
    // 开始绘制
    isPickingStart.value = false
    isPickingEnd.value = false
    pickerStatus.value = ''
    clearDrawing()
    isDrawing.value = true
    drawingStatus.value = '请在地图上点击添加多边形顶点（至少3个点）'
  }
}

function clearDrawing() {
  // 清除标记点
  drawingMarkers.forEach(marker => {
    marker.setMap(null)
  })
  drawingMarkers = []
  
  // 清除预览线
  if (drawingPolyline) {
    drawingPolyline.setMap(null)
    drawingPolyline = null
  }
  
  // 清空点集合
  drawingPoints = []
}

function registerFlightOverlay(overlay: any, type: FlightOverlayType) {
  if (!overlay) return
  ;(overlay as any).__flightPath = true
  ;(overlay as any).__flightType = type
  flightOverlays.push(overlay)
}

function removeFlightOverlaysByType(type: FlightOverlayType) {
  for (let i = flightOverlays.length - 1; i >= 0; i--) {
    const overlay = flightOverlays[i]
    if ((overlay as any).__flightType === type) {
      if (overlay?.setMap) {
        overlay.setMap(null)
      } else if (map) {
        map.remove(overlay)
      }
      flightOverlays.splice(i, 1)
    }
  }
  if (type === 'line') {
    flightLine = null
  }
  if (type === 'drone') {
    droneMarker = null
  }
}

function clearFlightOverlays() {
  for (let i = flightOverlays.length - 1; i >= 0; i--) {
    const overlay = flightOverlays[i]
    if (overlay?.setMap) {
      overlay.setMap(null)
    } else if (map) {
      map.remove(overlay)
    }
  }
  flightOverlays.length = 0
  flightLine = null
  if (droneMarker) {
    droneMarker.setMap(null)
    droneMarker = null
  }
}

function handleShowPathChange(value: boolean) {
  if (!map || !flightLine) return
  if (value) {
    map.add(flightLine)
  } else {
    map.remove(flightLine)
  }
}

function handleShowWaypointsChange(value: boolean) {
  toggleWaypointsByValue(value)
}

async function updateFlightPath() {
  if (!map) return

  stopSimulation()
  clearFlightOverlays()

  if (!startPoint.value) return

  try {
    // 调用后端 API 生成航线（固定使用水平扫描，通过 angle 参数控制方向）
    const response = await httpClient.post('/flight-path/generate', {
      polygon: path.value.slice(0, -1),
      spacing: currentSpacing.value,
      startPoint: startPoint.value,
      endPoint: endPoint.value || undefined,
      angle: currentAngle.value,
      margin: currentMargin.value
    })

    // 转换响应数据格式
    const result = {
      path: response.data.path as [number, number][],
      waypoints: response.data.waypoints as [number, number][]
    }

    flightData.value = result
    totalLength.value = Math.round(calculatePathLength(result.path))

    flightLine = new (window as any).AMap.Polyline({
      path: result.path,
      strokeColor: '#0000FF',
      strokeWeight: 5,
      zIndex: 51,
      showDir: true,
      dirColor: '#ff0000'
    })
    registerFlightOverlay(flightLine, 'line')
    if (showPath.value) {
      map.add(flightLine)
    }

    if (showWaypoints.value) {
      toggleWaypointsByValue(true)
    }
  } catch (error: any) {
    // 详细的错误日志
    console.error('========== 生成航线失败 ==========')
    console.error('错误时间:', new Date().toLocaleString())
    console.error('错误对象:', error)
    
    // 请求参数日志
    const requestParams = {
      polygon: path.value.slice(0, -1),
      spacing: currentSpacing.value,
      startPoint: startPoint.value,
      endPoint: endPoint.value || undefined,
      angle: currentAngle.value,
      margin: currentMargin.value
    }
    console.error('请求参数:', JSON.stringify(requestParams, null, 2))
    
    // HTTP 错误信息
    if (error.response) {
      // 服务器返回了错误响应
      console.error('HTTP 状态码:', error.response.status)
      console.error('响应数据:', error.response.data)
      console.error('响应头:', error.response.headers)
      alert(`生成航线失败 (${error.response.status}): ${error.response.data?.message || error.response.data || '服务器返回错误'}`)
    } else if (error.request) {
      // 请求已发出但没有收到响应
      console.error('请求已发出，但未收到响应')
      console.error('请求配置:', error.config)
      console.error('请求对象:', error.request)
      alert('生成航线失败: 无法连接到后端服务，请检查网络连接或后端服务是否运行')
    } else {
      // 其他错误
      console.error('错误消息:', error.message)
      console.error('错误堆栈:', error.stack)
      alert(`生成航线失败: ${error.message || '未知错误'}`)
    }
    console.error('================================')
  }
}

function toggleWaypoints(e: Event) {
  const target = e.target as HTMLInputElement
  toggleWaypointsByValue(target.checked)
}

function toggleWaypointsByValue(show: boolean) {
  removeFlightOverlaysByType('waypoint')

  if (show && flightData.value.waypoints.length > 0) {
    flightData.value.waypoints.forEach((point, index) => {
      const waypointMarker = new (window as any).AMap.Marker({
        position: point,
        offset: new (window as any).AMap.Pixel(-10, -10),
        content: `<div style="background-color: #fff; padding: 3px 8px; border: 2px solid #0000FF; border-radius: 50%; color: #0000FF; font-weight: bold;">${index + 1}</div>`,
        zIndex: 52
      })
      waypointMarker.setMap(map)
      registerFlightOverlay(waypointMarker, 'waypoint')
    })
  }
}

function simulateFlight() {
  if (isSimulating.value) {
    stopSimulation()
    return
  }

  if (currentSpeed.value === 0) {
    alert('请设置大于0的速度值')
    return
  }

  isSimulating.value = true
  currentPathIndex = 0

  if (!droneMarker) {
    removeFlightOverlaysByType('drone')
    droneMarker = new (window as any).AMap.Marker({
      position: flightData.value.path[0],
      content: '<div style="background-color: #FF4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>',
      offset: new (window as any).AMap.Pixel(-13, -13),
      zIndex: 100
    })
    droneMarker.setMap(map)
    registerFlightOverlay(droneMarker, 'drone')
  }

  startAnimation()
}

function stopSimulation() {
  if (animationInterval) clearInterval(animationInterval)
  removeFlightOverlaysByType('drone')
  isSimulating.value = false
  currentPathIndex = 0
}

function startAnimation() {
  const BASE_INTERVAL = 50
  const ANIMATION_INTERVAL = BASE_INTERVAL / currentSpeed.value
  const STEP_DISTANCE = 10

  animationInterval = window.setInterval(() => {
    if (currentPathIndex >= flightData.value.path.length - 1) {
      stopSimulation()
      return
    }

    const currentPos: [number, number] = [droneMarker.getPosition().getLng(), droneMarker.getPosition().getLat()]
    const nextPos = flightData.value.path[currentPathIndex + 1]
    
    if (!nextPos) {
      stopSimulation()
      return
    }
    
    const dist = calculateDistance(currentPos, nextPos)

    if (dist < STEP_DISTANCE) {
      currentPathIndex++
      droneMarker.setPosition(nextPos)
    } else {
      const ratio = STEP_DISTANCE / dist
      const newLng = currentPos[0] + (nextPos[0] - currentPos[0]) * ratio
      const newLat = currentPos[1] + (nextPos[1] - currentPos[1]) * ratio
      droneMarker.setPosition([newLng, newLat])
    }
  }, ANIMATION_INTERVAL)
}

function applyGeojson() {
  try {
    const data = JSON.parse(geojsonInput.value)
    if (
      data.type !== 'Feature' ||
      data.geometry.type !== 'Polygon' ||
      !Array.isArray(data.geometry.coordinates?.[0])
    ) {
      throw new Error('无效的GeoJSON格式')
    }
    path.value = data.geometry.coordinates[0]
    polygon.setPath(path.value)
    updateFlightPath()
    map.setFitView()
  } catch (e: any) {
    alert('GeoJSON解析错误：' + e.message)
  }
}

function exportGeojson() {
  const geojsonData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [path.value] },
        properties: { name: '扫描区域' }
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: flightData.value.path },
        properties: {
          name: '航线路径',
          spacing: currentSpacing.value,
          totalLength: calculatePathLength(flightData.value.path),
          angle: currentAngle.value
        }
      },
      ...(startPoint.value
        ? [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: startPoint.value },
              properties: { name: '起飞点' }
            }
          ]
        : []),
      ...(endPoint.value
        ? [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: endPoint.value },
              properties: { name: '降落点' }
            }
          ]
        : [])
    ]
  }

  const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'flight_path.geojson'
  a.click()
  URL.revokeObjectURL(url)
}

function setMapType(type: 'normal' | 'satellite') {
  mapType.value = type
  if (type === 'satellite') {
    if (satelliteLayer) map.remove(satelliteLayer)
    satelliteLayer = new (window as any).AMap.TileLayer.Satellite({ zIndex: 10 })
    map.add(satelliteLayer)
  } else {
    if (satelliteLayer) {
      map.remove(satelliteLayer)
      satelliteLayer = null
    }
  }
}

function initDefaultGeojson() {
  geojsonInput.value = JSON.stringify(
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [path.value]
      }
    },
    null,
    2
  )
}

watch(showPath, (newVal) => {
  if (!map || !flightLine) return
  if (newVal) {
    map.add(flightLine)
  } else {
    map.remove(flightLine)
  }
})
</script>

<style scoped>
/* 全局样式用于覆盖高德地图的默认样式 */
</style>

<style>
/* 移除高德地图 label 外层容器的默认蓝色边框，保留内部 div 的样式 */
.amap-marker-label {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
/* 不修改内部 div 的样式，让它保持原有的红色边框 */
</style>

<style scoped>
html,
body,
#container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
#container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.flight-planner {
  position: relative;
  width: 100vw;
  height: 100vh;
}

/* 左侧面板包装器 */
.left-panel-wrapper {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  overflow: visible;
}


.mapTypeControl {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255,255,255,0.95);
  padding: 5px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  z-index: 100;
}

.mapTypeControl button {
  padding: 8px 16px;
  margin: 0 5px;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

.mapTypeControl button.active {
  background-color: #e6f3ff;
  border-color: #1890ff;
  color: #1890ff;
}

.mapTypeControl button:hover {
  background-color: #f0f0f0;
}

.rightBottomPanel {
  position: absolute;
  bottom: 20px;
  right: 10px;
  width: 280px;
  background: rgba(255,255,255,0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.2);
  z-index: 1000;
}

.panel-section {
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.panel-section:last-child {
  border-bottom: none;
}

.panel-title {
  color: #333;
  font-weight: 500;
  margin-bottom: 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
}

.panel-title::before {
  content: '';
  width: 3px;
  height: 13px;
  background: #1890ff;
  margin-right: 8px;
  border-radius: 1px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0;
  font-size: 14px;
  color: #666;
}

.info-value {
  color: #0091ff;
  font-weight: 500;
}

</style>