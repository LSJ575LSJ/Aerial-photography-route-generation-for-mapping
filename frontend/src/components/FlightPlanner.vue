<template>
  <div class="flight-planner">
    <!-- 左侧面板 -->
    <div class="left-panel-wrapper">
      <RouteSettingsPanel
        :geojsonInput="geojsonInput"
        @update:geojsonInput="(val) => geojsonInput = val"
        :missionType="missionType"
        @update:missionType="(val) => (missionType = val)"
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
        :cameraLength="props.cameraLength"
        :altitude="props.altitude"
        :headingOverlap="headingOverlap"
        @update:headingOverlap="(val) => (headingOverlap = val)"
        :showCapturePoints="showCapturePoints"
        @update:showCapturePoints="(val) => (showCapturePoints = val)"
        :photoInterval="photoInterval"
        :gimbalYaw="gimbalYaw"
        @update:gimbalYaw="(val) => (gimbalYaw = val)"
        @lateral-offset-change="(val) => (lateralOffset = val)"
        :leftBandwidth="leftBandwidth"
        @update:leftBandwidth="(val) => (leftBandwidth = val)"
        :rightBandwidth="rightBandwidth"
        @update:rightBandwidth="(val) => (rightBandwidth = val)"
        @left-bandwidth-change="updateFlightPath"
        @right-bandwidth-change="updateFlightPath"
        @toggle-pick-start="togglePickStart"
        @toggle-pick-end="togglePickEnd"
        @apply-geojson="applyGeojson"
        @toggle-draw="toggleDraw"
        @spacing-change="updateFlightPath"
        @angle-change="updateFlightPath"
        @margin-change="updateFlightPath"
        @show-path-change="handleShowPathChange"
        @show-waypoints-change="handleShowWaypointsChange"
        @photo-interval-change="handlePhotoIntervalChange"
        @show-capture-points-change="handleShowCapturePointsChange"
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

    <!-- 倾斜摄影航线切换按钮组（仅倾斜模式显示） -->
    <div v-if="missionType === 'oblique' && flightLines.length >= 1" class="line-selector">
      <button
        v-for="(line, index) in flightLines"
        :key="index"
        :class="['line-button', { active: selectedLineIndex === index }]"
        @click="selectLine(index)"
      >
        {{ index + 1 }}
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
        <div class="info-item">
          <span>拍照间隔：</span>
          <span class="info-value">
            <span class="photoInterval">{{ photoInterval !== null ? photoInterval.toFixed(2) : '-' }}</span>米
          </span>
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
  cameraLength?: number | null
  altitude?: number
}

const props = withDefaults(defineProps<Props>(), {
  cameraWidth: null,
  cameraLength: null,
  altitude: 200
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
const missionType = ref<'mapping' | 'oblique' | 'strip'>('mapping')
const leftBandwidth = ref(50) // 左带宽（米）
const rightBandwidth = ref(50) // 右带宽（米）
const stripPath = ref<[number, number][]>([]) // 带状航线路径（LineString）
const showPath = ref(true)
const showWaypoints = ref(false)
const showCapturePoints = ref(false)
const currentSpeed = ref(10)
const isSimulating = ref(false)
const mapType = ref<'normal' | 'satellite'>('normal')
const isDrawing = ref(false)
const drawingStatus = ref('')
const headingOverlap = ref(70)
const gimbalYaw = ref(60)
const lateralOffset = ref(0)
const photoInterval = ref<number | null>(null)
const selectedLineIndex = ref(0) // 当前选中的航线索引（0-4）
const flightLines = ref<Array<{
  path: [number, number][]
  waypoints: [number, number][]
  capturePoints: [number, number][]
}>>([]) // 存储所有航线
let captureUpdateTimer: number | null = null

// 地图相关
type StripSegment = {
  index: number
  p1: [number, number]
  p2: [number, number]
  corners: {
    leftFront: [number, number]
    leftBack: [number, number]
    rightBack: [number, number]
    rightFront: [number, number]
  }
  polygon?: any
}

let map: any = null
let polygon: any = null // 区域航线的多边形
let stripPathPolyline: any = null // 带状航线的路径线对象
let stripPathPolygons: any[] = [] // 带状航线的每一段长方形多边形
let stripSegments: StripSegment[] = [] // 带状航线的每一段长方形数据
let flightLine: any = null
let startMarker: any = null
let endMarker: any = null
let droneMarker: any = null
let animationInterval: number | null = null
let currentPathIndex = 0
let satelliteLayer: any = null
type FlightOverlayType = 'line' | 'waypoint' | 'drone' | 'capture'
const flightOverlays: any[] = []

// 绘制相关
let drawingPoints: [number, number][] = []
let drawingPolyline: any = null
let drawingMarkers: any[] = []

// 航线数据 - 默认多边形范围（来自用户提供的 GeoJSON）
const path = ref<[number, number][]>([
  [116.290276, 39.855927],
  [116.27192, 39.826199],
  [116.331307, 39.81364],
  [116.342875, 39.848703],
  [116.290276, 39.855927]
])

const flightData = ref({
  path: [] as [number, number][],
  waypoints: [] as [number, number][],
  capturePoints: [] as [number, number][]
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
    if (missionType.value === 'strip') {
      // 带状航线：至少2个点，不闭合
      if (drawingPoints.length < 2) {
        alert('至少需要2个点才能构成路径')
        return
      }
      
      // 不闭合，直接使用 drawingPoints
      const linePath: [number, number][] = [...drawingPoints]
      
      // 生成 LineString 类型的 GeoJSON
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: linePath
        }
      }
      
      geojsonInput.value = JSON.stringify(geojson, null, 2)
      
      // 存储带状航线路径
      stripPath.value = linePath
      
      // 移除旧的多边形（如果有）
      if (polygon && polygon.setMap) {
        polygon.setMap(null)
      }
      if (stripPathPolyline && stripPathPolyline.setMap) {
        stripPathPolyline.setMap(null)
      }
      clearStripPolygons()
      
      // 使用 Polyline 显示路径
      stripPathPolyline = new (window as any).AMap.Polyline({
        path: linePath,
        strokeColor: '#FF6600',
        strokeWeight: 3,
        zIndex: 50
      })
      map.add(stripPathPolyline)
      
      // 根据带宽生成区域多边形并显示
      updateStripPathPolygon()
      
      updateFlightPath()
      map.setFitView()
    } else {
      // 区域航线：至少3个点，闭合
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
      
      // 移除带状航线的路径线（如果有）
      if (stripPathPolyline && stripPathPolyline.setMap) {
        stripPathPolyline.setMap(null)
        stripPathPolyline = null
      }
      clearStripPolygons()
      
      // 使用 Polygon 显示区域
      if (!polygon) {
        polygon = new (window as any).AMap.Polygon({
          path: closedPath,
          strokeColor: '#000000',
          strokeWeight: 2,
          fillColor: '#3366FF',
          fillOpacity: 0.3,
          zIndex: 50
        })
        map.add(polygon)
      } else {
        polygon.setPath(closedPath)
        // 确保 polygon 在地图上（可能之前被移除了）
        if (polygon.getMap() === null) {
          map.add(polygon)
        }
      }
      
      updateFlightPath()
      map.setFitView()
    }
    
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
    
    // 根据任务类型显示不同的提示
    if (missionType.value === 'strip') {
      drawingStatus.value = '请在地图上点击添加路径点（至少2个点）'
    } else {
      drawingStatus.value = '请在地图上点击添加多边形顶点（至少3个点）'
    }
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

function clearStripPolygons() {
  // 清除地图上的矩形多边形
  stripSegments.forEach((seg) => {
    if (seg.polygon && seg.polygon.setMap) {
      seg.polygon.setMap(null)
    }
    seg.polygon = undefined
  })
  stripSegments = []

  if (stripPathPolygons.length > 0) {
    stripPathPolygons.forEach((poly) => {
      if (poly && poly.setMap) {
        poly.setMap(null)
      }
    })
    stripPathPolygons = []
  }
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

function handleShowCapturePointsChange(value: boolean) {
  showCapturePoints.value = value
  if (
    value &&
    photoInterval.value !== null &&
    photoInterval.value > 0 &&
    (!flightData.value.capturePoints ||
      flightData.value.capturePoints.length === 0)
  ) {
    updateFlightPath()
    return
  }
  toggleCapturePoints(value)
}

function handlePhotoIntervalChange(value: number | null) {
  photoInterval.value = value
}

watch(photoInterval, (val) => {
  if (captureUpdateTimer) {
    clearTimeout(captureUpdateTimer)
    captureUpdateTimer = null
  }
  if (val === null || val <= 0) {
    return
  }
  captureUpdateTimer = window.setTimeout(() => {
    captureUpdateTimer = null
    updateFlightPath()
  }, 300)
})

// 监听带宽变化，更新带状航线区域显示
watch([leftBandwidth, rightBandwidth], () => {
  if (missionType.value === 'strip' && stripPath.value.length >= 2) {
    updateStripPathPolygon()
  }
})

// 监听任务类型变化
watch(missionType, (newType, oldType) => {
  // 切换任务类型时清理绘制状态
  if (isDrawing.value) {
    clearDrawing()
    isDrawing.value = false
    drawingStatus.value = ''
  }
  
  // 切换任务类型时，清理另一个类型的显示
  if (newType === 'strip' && oldType !== 'strip') {
    // 切换到带状航线：隐藏区域航线的 polygon
    if (polygon && polygon.setMap) {
      polygon.setMap(null)
    }
  } else if (newType !== 'strip' && oldType === 'strip') {
    // 切换到区域航线：清理带状航线的显示，恢复 polygon
    if (stripPathPolyline && stripPathPolyline.setMap) {
      stripPathPolyline.setMap(null)
      stripPathPolyline = null
    }
    clearStripPolygons()
    // 恢复区域航线的 polygon 显示（如果 path 有数据）
    if (polygon && path.value.length > 0) {
      polygon.setPath(path.value)
      // 确保 polygon 在地图上
      if (polygon.getMap() === null) {
        map.add(polygon)
      }
    }
  }
})

/**
 * 计算两条延长线的交点，用于带状航线生成（不限制在0-1范围内）
 * @param line1Start - 第一条线的起点
 * @param line1End - 第一条线的终点
 * @param line2Start - 第二条线的起点
 * @param line2End - 第二条线的终点
 * @returns 交点坐标或 null（如果平行）
 */
function findExtendedLineIntersection(
  line1Start: [number, number],
  line1End: [number, number],
  line2Start: [number, number],
  line2End: [number, number]
): [number, number] | null {
  const x1 = line1Start[0], y1 = line1Start[1]
  const x2 = line1End[0], y2 = line1End[1]
  const x3 = line2Start[0], y3 = line2Start[1]
  const x4 = line2End[0], y4 = line2End[1]

  // 计算分母
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  
  // 如果分母为0，说明两条线平行
  if (Math.abs(denominator) < 1e-10) return null

  // 计算参数 t 和 u（允许超出0-1范围）
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator

  // 计算交点（使用第一条线的参数方程）
  return [
    x1 + t * (x2 - x1),
    y1 + t * (y2 - y1)
  ]
}

// 根据当前 corners 更新或创建某一段的多边形
function updateStripSegmentPolygon(segment: StripSegment) {
  const { leftFront, leftBack, rightBack, rightFront } = segment.corners
  const rectPath: [number, number][] = [
    leftFront,
    leftBack,
    rightBack,
    rightFront,
    leftFront, // 闭合
  ]

  if (segment.polygon && segment.polygon.setPath) {
    segment.polygon.setPath(rectPath)
  } else {
    const rectPolygon = new (window as any).AMap.Polygon({
      path: rectPath,
      strokeColor: '#3366FF',
      strokeWeight: 2,
      fillColor: '#3366FF',
      fillOpacity: 0.2,
      zIndex: 49,
    })
    segment.polygon = rectPolygon
    map.add(rectPolygon)
    stripPathPolygons.push(rectPolygon)
  }
}

// 使用延长线交点平滑相邻矩形的连接处，并重绘
function smoothStripIntersections() {
  if (stripSegments.length < 2) return

  for (let i = 0; i < stripSegments.length - 1; i++) {
    const segA = stripSegments[i]
    const segB = stripSegments[i + 1]

    const {
      leftFront: LF_A,
      leftBack: LB_A,
      rightBack: RB_A,
      rightFront: RF_A,
    } = segA.corners
    const {
      leftFront: LF_B,
      leftBack: LB_B,
      rightBack: RB_B,
      rightFront: RF_B,
    } = segB.corners

    // 左侧：第一段 LF_A -> LB_A，第二段 LB_B -> LF_B
    const leftIntersection = findExtendedLineIntersection(LF_A, LB_A, LB_B, LF_B)
    if (leftIntersection) {
      segA.corners.leftBack = leftIntersection
      segB.corners.leftFront = leftIntersection
    }

    // 右侧：第一段 RF_A -> RB_A，第二段 RB_B -> RF_B
    const rightIntersection = findExtendedLineIntersection(RF_A, RB_A, RB_B, RF_B)
    if (rightIntersection) {
      segA.corners.rightBack = rightIntersection
      segB.corners.rightFront = rightIntersection
    }
  }

  // 根据更新后的 corners 重绘所有段
  stripSegments.forEach((seg) => updateStripSegmentPolygon(seg))
}

// 根据带宽生成带状航线的区域多边形（简化版：每一段生成一个独立长方形）
function updateStripPathPolygon() {
  if (stripPath.value.length < 2) return

  // 先移除之前画过的矩形
  clearStripPolygons()
  stripSegments = []

  // 对每一段 Pi -> P(i+1) 生成一个长方形
  for (let i = 0; i < stripPath.value.length - 1; i++) {
    const p1 = stripPath.value[i]
    const p2 = stripPath.value[i + 1]
    if (!p1 || !p2) continue

    // 线段方向
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI

    // 垂直方向：左侧 / 右侧
    const leftAngle = angle + 90
    const rightAngle = angle - 90

    // 用该段中点的纬度估算“1度经纬度对应多少米”
    const avgLat = (p1[1] + p2[1]) / 2
    const latRad = (avgLat * Math.PI) / 180
    const metersPerDegLng = 111320 * Math.cos(latRad)
    const metersPerDegLat = 111320

    // 左侧偏移向量（用左带宽）
    const leftAngleRad = (leftAngle * Math.PI) / 180
    const leftOffsetLng =
      (leftBandwidth.value / metersPerDegLng) * Math.cos(leftAngleRad)
    const leftOffsetLat =
      (leftBandwidth.value / metersPerDegLat) * Math.sin(leftAngleRad)

    // 右侧偏移向量（用右带宽）
    const rightAngleRad = (rightAngle * Math.PI) / 180
    const rightOffsetLng =
      (rightBandwidth.value / metersPerDegLng) * Math.cos(rightAngleRad)
    const rightOffsetLat =
      (rightBandwidth.value / metersPerDegLat) * Math.sin(rightAngleRad)

    // 四个角点：P1 左 / P2 左 / P2 右 / P1 右
    const p1Left: [number, number] = [p1[0] + leftOffsetLng, p1[1] + leftOffsetLat]
    const p2Left: [number, number] = [p2[0] + leftOffsetLng, p2[1] + leftOffsetLat]
    const p2Right: [number, number] = [p2[0] + rightOffsetLng, p2[1] + rightOffsetLat]
    const p1Right: [number, number] = [p1[0] + rightOffsetLng, p1[1] + rightOffsetLat]

    // 统一按顺序保存角点：左前、左后、右后、右前
    const leftFront: [number, number] = p1Left
    const leftBack: [number, number] = p2Left
    const rightBack: [number, number] = p2Right
    const rightFront: [number, number] = p1Right

    // 保存到段数组，方便后续计算交点 / 重绘
    const segment: StripSegment = {
      index: i,
      p1,
      p2,
      corners: {
        leftFront,
        leftBack,
        rightBack,
        rightFront,
      },
      polygon: undefined,
    }

    stripSegments.push(segment)
    updateStripSegmentPolygon(segment)
  }

  // 生成所有基础矩形后，再进行交点平滑处理并重绘
  smoothStripIntersections()
}

async function updateFlightPath() {
  if (!map) return

  stopSimulation()
  clearFlightOverlays()

  if (!startPoint.value) return

  try {
    // 根据任务类型构建不同的请求参数
    let requestBody: any
    
    if (missionType.value === 'strip') {
      // 带状航线
      if (stripPath.value.length < 2) {
        console.warn('带状航线路径点不足，无法生成航线')
        return
      }
      requestBody = {
        path: stripPath.value, // LineString 路径
        spacing: currentSpacing.value,
        startPoint: startPoint.value,
        endPoint: endPoint.value || undefined,
        leftBandwidth: leftBandwidth.value,
        rightBandwidth: rightBandwidth.value,
        missionType: missionType.value,
        margin: 0, // 带状航线边距固定为0
        captureInterval: photoInterval.value || null
      }
    } else {
      // 区域航线（建图/倾斜）
      requestBody = {
        polygon: path.value.slice(0, -1),
        spacing: currentSpacing.value,
        startPoint: startPoint.value,
        endPoint: endPoint.value || undefined,
        angle: currentAngle.value,
        margin: currentMargin.value,
        missionType: missionType.value,
        gimbalYaw: missionType.value === 'oblique' ? gimbalYaw.value : undefined,
        lateralOffset: missionType.value === 'oblique' ? lateralOffset.value : undefined,
        captureInterval: photoInterval.value || null
      }
    }
    
    // 调用后端 API 生成航线
    const response = await httpClient.post('/flight-path/generate', requestBody)

    // 转换响应数据格式
    const result = {
      path: response.data.path as [number, number][],
      waypoints: response.data.waypoints as [number, number][],
      capturePoints: (response.data.capturePoints || []) as [number, number][]
    }

    // 存储所有航线（如果有lines字段）
    if (response.data.lines && Array.isArray(response.data.lines) && response.data.lines.length > 0) {
      console.log('收到多条航线:', response.data.lines.length)
      flightLines.value = response.data.lines.map((line: any) => ({
        path: line.path as [number, number][],
        waypoints: line.waypoints as [number, number][],
        capturePoints: (line.capturePoints || []) as [number, number][]
      }))
      console.log('flightLines.value.length:', flightLines.value.length)
      // 默认选中第一条
      selectedLineIndex.value = 0
      // 使用选中的航线数据
      const selectedLine = flightLines.value[selectedLineIndex.value]
      if (selectedLine) {
        flightData.value = {
          path: selectedLine.path,
          waypoints: selectedLine.waypoints,
          capturePoints: selectedLine.capturePoints
        }
      }
    } else {
      // 建图模式：只有一条航线
      console.log('建图模式或没有lines字段，使用单条航线')
      flightLines.value = [result]
      selectedLineIndex.value = 0
      flightData.value = result
    }

    totalLength.value = Math.round(calculatePathLength(flightData.value.path))

    // 使用选中的航线数据绘制
    const displayLine = flightLines.value.length > 0 && flightLines.value[selectedLineIndex.value] 
      ? flightLines.value[selectedLineIndex.value] 
      : result
    if (displayLine) {
      flightLine = new (window as any).AMap.Polyline({
        path: displayLine.path,
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

      if (showCapturePoints.value) {
        toggleCapturePoints(true)
      }
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

function toggleCapturePoints(show: boolean) {
  removeFlightOverlaysByType('capture')

  if (show && flightData.value.capturePoints && flightData.value.capturePoints.length > 0) {
    flightData.value.capturePoints.forEach((point) => {
      const captureMarker = new (window as any).AMap.Marker({
        position: point,
        offset: new (window as any).AMap.Pixel(-6, -6),
        content:
          '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #ff6600; border: 2px solid #ffffff; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>',
        zIndex: 53
      })
      captureMarker.setMap(map)
      registerFlightOverlay(captureMarker, 'capture')
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
    
    if (data.type !== 'Feature') {
      throw new Error('无效的GeoJSON格式，必须是Feature类型')
    }
    
    if (data.geometry.type === 'LineString') {
      // 带状航线：LineString
      if (!Array.isArray(data.geometry.coordinates)) {
        throw new Error('无效的LineString格式')
      }
      
      stripPath.value = data.geometry.coordinates
      
      // 移除旧的多边形（如果有）
      if (polygon && polygon.setMap) {
        polygon.setMap(null)
      }
      if (stripPathPolyline && stripPathPolyline.setMap) {
        stripPathPolyline.setMap(null)
      }
      clearStripPolygons()
      
      // 使用 Polyline 显示路径
      stripPathPolyline = new (window as any).AMap.Polyline({
        path: stripPath.value,
        strokeColor: '#FF6600',
        strokeWeight: 3,
        zIndex: 50
      })
      map.add(stripPathPolyline)
      
      // 根据带宽生成区域多边形并显示
      updateStripPathPolygon()
      
    } else if (data.geometry.type === 'Polygon') {
      // 区域航线：Polygon
      if (!Array.isArray(data.geometry.coordinates?.[0])) {
        throw new Error('无效的Polygon格式')
      }
      
      path.value = data.geometry.coordinates[0]
      
      // 移除带状航线的路径线（如果有）
      if (stripPathPolyline && stripPathPolyline.setMap) {
        stripPathPolyline.setMap(null)
        stripPathPolyline = null
      }
      clearStripPolygons()
      
      // 使用 Polygon 显示区域
      if (!polygon) {
        polygon = new (window as any).AMap.Polygon({
          path: path.value,
          strokeColor: '#000000',
          strokeWeight: 2,
          fillColor: '#3366FF',
          fillOpacity: 0.3,
          zIndex: 50
        })
        map.add(polygon)
      } else {
        polygon.setPath(path.value)
        // 确保 polygon 在地图上（可能之前被移除了）
        if (polygon.getMap() === null) {
          map.add(polygon)
        }
      }
    } else {
      throw new Error('不支持的GeoJSON类型，仅支持Polygon或LineString')
    }
    
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

function selectLine(index: number) {
  if (index < 0 || index >= flightLines.value.length) return
  selectedLineIndex.value = index
  const selectedLine = flightLines.value[index]
  if (!selectedLine) return
  
  flightData.value = {
    path: selectedLine.path,
    waypoints: selectedLine.waypoints,
    capturePoints: selectedLine.capturePoints
  }
  totalLength.value = Math.round(calculatePathLength(selectedLine.path))
  
  // 重新绘制地图上的航线
  stopSimulation()
  clearFlightOverlays()
  
  if (flightLine) {
    flightLine.setMap(null)
  }
  
  flightLine = new (window as any).AMap.Polyline({
    path: selectedLine.path,
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
  
  if (showCapturePoints.value) {
    toggleCapturePoints(true)
  }
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

// 监听任务类型变化，自动更新航线
watch(missionType, () => {
  if (startPoint.value) {
    updateFlightPath()
  }
})

// 监听偏移量变化，自动更新航线（仅倾斜模式）
watch(lateralOffset, () => {
  if (missionType.value === 'oblique' && startPoint.value) {
    updateFlightPath()
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

.line-selector {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 2001;
}

.line-button {
  width: 32px;
  height: 32px;
  padding: 0;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.line-button:hover {
  background-color: #f5f5f5;
  border-color: #1890ff;
}

.line-button.active {
  background-color: #1890ff;
  border-color: #1890ff;
  color: white;
  font-weight: 600;
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