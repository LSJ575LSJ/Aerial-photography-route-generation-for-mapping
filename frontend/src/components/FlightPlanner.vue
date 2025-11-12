<template>
  <div class="flight-planner">
    <!-- 左侧面板 -->
    <div class="leftPanel">
      <div class="systemTitle">无人机飞行路线规划</div>

      <!-- 目标区域设置 -->
      <div class="panel-section section-target-area">
        <div class="panel-title">目标区域设置</div>
        <textarea v-model="geojsonInput" placeholder="输入GeoJSON数据..."></textarea>
        <button @click="applyGeojson">应用</button>
      </div>

      <div class="section-divider"></div>

      <!-- 路线设置 -->
      <div class="panel-section section-route-settings">
        <div class="panel-title">路线设置</div>
        <div class="pointPickerControl">
          <button
            class="startPointPicker"
            :class="{ active: isPickingStart }"
            @click="togglePickStart"
          >
            设置起飞点
          </button>
          <div class="coord-display">
            <span>起飞点：</span>
            <span class="startPointCoord">{{ startPoint ? formatCoord(startPoint) : '未设置' }}</span>
          </div>
          <button
            class="endPointPicker"
            :class="{ active: isPickingEnd }"
            @click="togglePickEnd"
          >
            设置降落点
          </button>
          <div class="coord-display">
            <span>降落点：</span>
            <span class="endPointCoord">{{ endPoint ? formatCoord(endPoint) : '未设置' }}</span>
          </div>
          <div class="pickerStatus">{{ pickerStatus }}</div>
        </div>
        <div class="spacingControl">
          <span>间距</span>
          <input
            type="range"
            class="spacingSlider"
            min="100"
            max="1000"
            v-model.number="currentSpacing"
            step="50"
            @input="updateFlightPath"
          />
          <span><span class="spacingValue">{{ currentSpacing }}</span>m</span>
        </div>
        <button class="directionButton" @click="toggleDirection">
          切换为{{ currentDirection === 'horizontal' ? '垂直' : '水平' }}扫描
        </button>
      </div>

      <div class="section-divider"></div>

      <!-- 结果显示 -->
      <div class="panel-section section-results">
        <div class="panel-title">结果显示</div>
        <div class="showPathControl">
          <div class="checkbox-group">
            <input type="checkbox" id="showPath" class="showPath" v-model="showPath" />
            <label for="showPath">显示航线</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showWaypoints" class="showWaypoints" v-model="showWaypoints" @change="toggleWaypoints" />
            <label for="showWaypoints">显示航点</label>
          </div>
        </div>

        <div class="speedControl">
          速度：<input
            type="range"
            class="speedSlider"
            min="0"
            max="100"
            v-model.number="currentSpeed"
            step="1"
          />
          <span class="speedValue">{{ currentSpeed }}</span>倍
        </div>
        <button class="simulateButton" @click="simulateFlight">
          {{ isSimulating ? '停止模拟' : '模拟飞行' }}
        </button>
        <button class="exportGeojson" @click="exportGeojson">导出航线</button>
      </div>
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

// ========== 状态 ==========
const geojsonInput = ref<string>('')
const startPoint = ref<[number, number] | null>([116.352209, 39.867487])
const endPoint = ref<[number, number] | null>(null)
const isPickingStart = ref(false)
const isPickingEnd = ref(false)
const pickerStatus = ref('')
const currentSpacing = ref(350)
const currentDirection = ref<'horizontal' | 'vertical'>('horizontal')
const showPath = ref(true)
const showWaypoints = ref(false)
const currentSpeed = ref(10)
const isSimulating = ref(false)
const mapType = ref<'normal' | 'satellite'>('normal')

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
})

onBeforeUnmount(() => {
  if (animationInterval) clearInterval(animationInterval)
})

// ========== 方法 ==========
function formatCoord(coord: [number, number]): string {
  return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`
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
  if (!isPickingStart.value && !isPickingEnd.value) return

  const coords: [number, number] = [e.lnglat.getLng(), e.lnglat.getLat()]

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
  isPickingStart.value = !isPickingStart.value
  pickerStatus.value = isPickingStart.value ? '请在地图上点击选择起飞点位置' : ''
}

function togglePickEnd() {
  isPickingStart.value = false
  isPickingEnd.value = !isPickingEnd.value
  pickerStatus.value = isPickingEnd.value ? '请在地图上点击选择降落点位置' : ''
}

function toggleDirection() {
  currentDirection.value = currentDirection.value === 'horizontal' ? 'vertical' : 'horizontal'
  updateFlightPath()
}

async function updateFlightPath() {
  if (!map) return

  if (flightLine) {
    map.remove(flightLine)
    flightLine = null
  }

  const allMarkers = map.getAllOverlays('marker')
  allMarkers.forEach((marker: any) => {
    if (marker !== startMarker && marker !== endMarker) {
      map.remove(marker)
    }
  })

  if (!startPoint.value) return

  try {
    // 调用后端 API 生成航线
    const response = await httpClient.post('/flight-path/generate', {
      polygon: path.value.slice(0, -1),
      spacing: currentSpacing.value,
      startPoint: startPoint.value,
      direction: currentDirection.value,
      endPoint: endPoint.value || undefined
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

    if (showPath.value) {
      map.add(flightLine)
    }

    if (showWaypoints.value) {
      const fakeEvent = new Event('change') as any
      fakeEvent.target = { checked: true } as HTMLInputElement
      toggleWaypoints(fakeEvent)
    }
  } catch (error) {
    console.error('生成航线失败:', error)
    alert('生成航线失败，请检查网络连接或后端服务')
  }
}

function toggleWaypoints(e: Event) {
  const target = e.target as HTMLInputElement
  const allMarkers = map.getAllOverlays('marker')
  allMarkers.forEach((marker: any) => {
    if (marker !== startMarker && marker !== endMarker) {
      map.remove(marker)
    }
  })

  if (target.checked && flightData.value.waypoints.length > 0) {
    flightData.value.waypoints.forEach((point, index) => {
      new (window as any).AMap.Marker({
        position: point,
        offset: new (window as any).AMap.Pixel(-10, -10),
        content: `<div style="background-color: #fff; padding: 3px 8px; border: 2px solid #0000FF; border-radius: 50%; color: #0000FF; font-weight: bold;">${index + 1}</div>`,
        zIndex: 52
      }).setMap(map)
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
    droneMarker = new (window as any).AMap.Marker({
      position: flightData.value.path[0],
      content: '<div style="background-color: #FF4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>',
      offset: new (window as any).AMap.Pixel(-13, -13),
      zIndex: 100
    })
    droneMarker.setMap(map)
  }

  startAnimation()
}

function stopSimulation() {
  if (animationInterval) clearInterval(animationInterval)
  if (droneMarker) {
    droneMarker.setMap(null)
    droneMarker = null
  }
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
          direction: currentDirection.value
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

/* 左侧面板样式 */
.leftPanel {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 320px;
  max-height: calc(100vh - 40px);
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  overflow-y: auto;
}

.leftPanel .panel-section {
  padding: 16px;
  position: relative;
}

.leftPanel .panel-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, 
      rgba(24, 144, 255, 0.1) 0%,
      rgba(24, 144, 255, 0.05) 100%);
}

.leftPanel .panel-section:first-child::before {
  display: none;
}

.leftPanel .panel-title {
  color: #1a1a1a;
  font-weight: 600;
  margin-bottom: 20px;
  font-size: 16px;
  display: flex;
  align-items: center;
  letter-spacing: 0.5px;
  position: relative;
}

.leftPanel .panel-title::before {
  content: '';
  width: 4px;
  height: 18px;
  background: linear-gradient(180deg, #1890ff 0%, #40a9ff 100%);
  margin-right: 12px;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.leftPanel .panel-section:hover .panel-title::before {
  background: #40a9ff;
  transform: scaleY(1.1);
}

textarea {
  width: 100%;
  height: 80px;
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  resize: none;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Monaco', monospace;
  box-sizing: border-box;
  margin-bottom: 16px;
  background: rgba(247, 248, 250, 0.6);
  transition: all 0.3s ease;
  line-height: 1.5;
}

textarea:focus {
  border-color: #40a9ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
  outline: none;
}

.leftPanel button {
  height: 32px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 0 16px;
  font-size: 13px;
  color: #666;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
  font-weight: 400;
  letter-spacing: 0.3px;
  backdrop-filter: blur(8px);
}

.leftPanel button:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(24, 144, 255, 0.3);
  color: #1890ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
}

.leftPanel button.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
  font-weight: 600;
}

.spacingControl,
.speedControl {
  background: rgba(247, 248, 250, 0.6);
  padding: 12px;
  border-radius: 12px;
  margin: 8px 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}

.spacingControl span,
.speedControl span {
  color: #666;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.spacingValue,
.speedValue {
  color: #1890ff;
  font-weight: 600;
  min-width: 24px;
  display: inline-block;
  text-align: right;
  background: rgba(24, 144, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
}

.coord-display {
  font-size: 13px;
  color: #666;
  margin: 8px 0 16px 0;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.coord-display:last-child {
  margin-bottom: 0;
}

.coord-display span:first-child {
  color: #666;
  font-weight: 500;
}

.coord-display span:last-child {
  color: #1890ff;
  font-family: 'JetBrains Mono', 'Monaco', monospace;
  font-size: 13px;
  font-weight: 500;
  background: rgba(24, 144, 255, 0.06);
  padding: 4px 8px;
  border-radius: 6px;
}

.pickerStatus {
  font-size: 13px;
  color: #666;
  text-align: center;
  padding: 8px 0;
  transition: all 0.3s ease;
  background: rgba(24, 144, 255, 0.06);
  border-radius: 8px;
}

input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: #e1e1e1;
  border-radius: 2px;
  outline: none;
  margin: 16px 0 8px 0;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: linear-gradient(180deg, #fff 0%, #f7f7f7 100%);
  border: 2px solid #1890ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
}

.showPathControl {
  background: rgba(255, 255, 255, 0.8);
  padding: 16px;
  border-radius: 8px;
  margin: 0 0 16px 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 20px;
}

.showPathControl .checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.showPathControl .checkbox-group label {
  color: #666;
  font-size: 13px;
  font-weight: 500;
  user-select: none;
  white-space: nowrap;
}

.showPathControl input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
  -webkit-appearance: none;
  border: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  background: #fff;
}

.showPathControl input[type="checkbox"]:checked {
  background: #1890ff;
  border-color: #1890ff;
}

.showPathControl input[type="checkbox"]:checked::after {
  content: '✓';
  position: absolute;
  color: white;
  font-size: 14px;
  font-weight: bold;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.section-divider {
  height: 16px;
  background: linear-gradient(90deg,
      rgba(24, 144, 255, 0.02) 0%,
      rgba(24, 144, 255, 0.04) 50%,
      rgba(24, 144, 255, 0.02) 100%);
  margin: 0;
  border: none;
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

.exportGeojson {
  height: 44px !important;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%) !important;
  color: white !important;
  border: none !important;
  font-weight: 600 !important;
  font-size: 15px !important;
  letter-spacing: 1px !important;
  border-radius: 12px !important;
  margin-top: 20px !important;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15) !important;
  width: 100%;
}

.exportGeojson:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 16px rgba(24, 144, 255, 0.25) !important;
  background: linear-gradient(135deg, #40a9ff 0%, #1890ff 100%) !important;
}

.simulateButton {
  background: rgba(0, 200, 83, 0.1) !important;
  color: #00c853 !important;
  border: 1px solid rgba(0, 200, 83, 0.2) !important;
  font-weight: 500 !important;
  width: 100%;
  height: 32px;
  border-radius: 8px;
  margin-top: 12px;
}

.simulateButton:hover {
  background: rgba(0, 200, 83, 0.15) !important;
  border-color: rgba(0, 200, 83, 0.3) !important;
  box-shadow: 0 2px 8px rgba(0, 200, 83, 0.1) !important;
}

.systemTitle {
  font-size: large;
  padding: 10px;
  background-color: #1890ff;
  color: white;
  text-align: center;
  font-weight: bold;
}
</style>