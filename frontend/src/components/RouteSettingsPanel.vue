<template>
  <el-card class="route-settings-panel" shadow="hover">
    <template #header>
      <div class="panel-header">无人机飞行路线规划</div>
    </template>

    <!-- 目标区域设置 -->
    <el-collapse v-model="activeCollapse" class="settings-collapse">
      <el-collapse-item title="目标区域设置" name="target">
        <el-form label-position="top" size="small">
          <el-form-item label="航线类型">
            <el-radio-group v-model="missionType" size="small">
              <el-radio-button label="mapping">建图航拍</el-radio-button>
              <el-radio-button label="oblique">倾斜摄影</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="GeoJSON 数据">
            <el-input
              :model-value="geojsonInput"
              @update:model-value="handleGeojsonInputChange"
              type="textarea"
              :rows="4"
              placeholder="输入GeoJSON数据..."
            />
          </el-form-item>
          <el-form-item>
            <el-button 
              :type="isDrawing ? 'danger' : 'primary'" 
              @click="handleToggleDraw" 
              style="width: 100%"
            >
              {{ isDrawing ? '完成绘制' : '点击地图绘制区域' }}
            </el-button>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleApplyGeojson" style="width: 100%">
              应用 GeoJSON
            </el-button>
          </el-form-item>
          <el-alert
            v-if="drawingStatus"
            :title="drawingStatus"
            type="info"
            :closable="false"
            style="margin-top: 8px;"
          />
        </el-form>
      </el-collapse-item>

      <!-- 路线设置 -->
      <el-collapse-item title="路线设置" name="route">
        <el-form label-position="top" size="small">
          <!-- 起飞点/降落点 -->
          <el-form-item label="起飞点">
            <div style="display: flex; gap: 8px; align-items: center;">
              <el-button
                :type="isPickingStart ? 'primary' : 'default'"
                size="small"
                @click="handleTogglePickStart"
              >
                设置起飞点
              </el-button>
              <span class="coord-text">{{ startPointText }}</span>
            </div>
          </el-form-item>

          <el-form-item label="降落点">
            <div style="display: flex; gap: 8px; align-items: center;">
              <el-button
                :type="isPickingEnd ? 'primary' : 'default'"
                size="small"
                @click="handleTogglePickEnd"
              >
                设置降落点
              </el-button>
              <span class="coord-text">{{ endPointText }}</span>
            </div>
          </el-form-item>

          <el-alert
            v-if="pickerStatus"
            :title="pickerStatus"
            type="info"
            :closable="false"
            style="margin-bottom: 16px;"
          />

          <!-- 旁向重叠率 -->
          <el-form-item label="旁向重叠率 (%)">
            <el-slider
              :model-value="overlapRate"
              @update:model-value="handleOverlapRateChange"
              :min="0"
              :max="100"
              :step="1"
              show-input
            />
          </el-form-item>
          
          <!-- 计算出的间距显示 -->
          <el-form-item label="航线间距 (m)">
            <div class="spacing-display">
              <span v-if="calculatedSpacing !== null" class="spacing-value">{{ calculatedSpacing.toFixed(2) }}</span>
              <span v-else class="spacing-hint">需要先计算相机拍摄宽度</span>
            </div>
          </el-form-item>

          <!-- 航向重叠率 -->
          <el-form-item label="航向重叠率 (%)">
            <el-slider
              :model-value="headingOverlapLocal"
              @update:model-value="handleHeadingOverlapChange"
              :min="0"
              :max="100"
              :step="1"
              show-input
            />
          </el-form-item>

          <!-- 单张照片航向覆盖长度 -->
          <el-form-item label="单张照片航向覆盖长度 (m)">
            <div class="spacing-display">
              <span v-if="props.cameraLength !== null" class="spacing-value">{{ props.cameraLength.toFixed(2) }}</span>
              <span v-else class="spacing-hint">请在右侧相机参数中计算</span>
            </div>
          </el-form-item>

          <!-- 拍照间隔 -->
          <el-form-item label="拍照间隔 (m)">
            <div class="spacing-display">
              <span v-if="calculatedPhotoInterval !== null" class="spacing-value">{{ calculatedPhotoInterval.toFixed(2) }}</span>
              <span v-else class="spacing-hint">请设置航向画幅长度和航向重叠率</span>
            </div>
          </el-form-item>

          <!-- 角度 -->
          <el-form-item label="角度 (°)">
            <el-slider
              :model-value="angle"
              @update:model-value="handleAngleChange"
              :min="0"
              :max="180"
              :step="1"
              show-input
            />
          </el-form-item>

          <!-- 云台水平夹角（仅倾斜摄影） -->
          <el-form-item
            v-if="missionType === 'oblique'"
            label="云台垂直夹角 (°)"
          >
            <el-slider
              :model-value="props.gimbalYaw"
              @update:model-value="handleGimbalYawChange"
              :min="0"
              :max="90"
              :step="1"
              show-input
            />
          </el-form-item>

          <!-- 偏移距离显示（仅倾斜摄影） -->
          <el-form-item
            v-if="missionType === 'oblique'"
            label="偏移距离 (m)"
          >
            <div class="spacing-display">
              <span v-if="calculatedLateralOffset !== null && calculatedLateralOffset > 0" class="spacing-value">{{ calculatedLateralOffset.toFixed(2) }}</span>
              <span v-else class="spacing-hint">请设置云台垂直夹角和飞行高度</span>
            </div>
          </el-form-item>

          <!-- 边距 -->
          <el-form-item label="边距 (m)">
            <el-slider
              :model-value="margin"
              @update:model-value="handleMarginChange"
              :min="0"
              :max="5000"
              :step="50"
              show-input
            />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <!-- 结果显示 -->
      <el-collapse-item title="结果显示" name="results">
        <el-form label-position="top" size="small">
          <el-form-item label="显示选项" class="display-options">
            <el-checkbox :model-value="showPath" @update:model-value="handleShowPathChange">
              显示航线
            </el-checkbox>
            <el-checkbox :model-value="showWaypoints" @update:model-value="handleShowWaypointsChange">
              显示航点
            </el-checkbox>
            <el-checkbox :model-value="showCapturePointsLocal" @update:model-value="handleShowCapturePointsChange">
              显示拍照点
            </el-checkbox>
          </el-form-item>

          <el-form-item label="模拟速度 (倍)">
            <el-slider
              :model-value="speed"
              @update:model-value="handleSpeedChange"
              :min="0"
              :max="100"
              :step="1"
              show-input
            />
          </el-form-item>

          <el-form-item>
            <el-button
              :type="isSimulating ? 'danger' : 'success'"
              @click="handleSimulate"
              style="width: 100%"
            >
              {{ isSimulating ? '停止模拟' : '模拟飞行' }}
            </el-button>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="handleExport" style="width: 100%">
              导出航线
            </el-button>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  geojsonInput: string
  missionType?: 'mapping' | 'oblique'
  startPoint: [number, number] | null
  endPoint: [number, number] | null
  isPickingStart: boolean
  isPickingEnd: boolean
  pickerStatus: string
  spacing: number
  angle: number
  margin: number
  showPath: boolean
  showWaypoints: boolean
  speed: number
  isSimulating: boolean
  isDrawing: boolean
  drawingStatus: string
  cameraWidth: number | null
  cameraLength: number | null
  altitude?: number
  headingOverlap: number
  showCapturePoints: boolean
  photoInterval: number | null
  gimbalYaw?: number
}

const props = withDefaults(defineProps<Props>(), {
  missionType: 'mapping',
  gimbalYaw: 0,
  altitude: 200,
})

const emit = defineEmits<{
  'update:geojsonInput': [value: string]
  'update:missionType': [value: 'mapping' | 'oblique']
  'update:spacing': [value: number]
  'update:angle': [value: number]
  'update:margin': [value: number]
  'update:showPath': [value: boolean]
  'update:showWaypoints': [value: boolean]
  'update:speed': [value: number]
  'update:headingOverlap': [value: number]
  'update:showCapturePoints': [value: boolean]
  'toggle-pick-start': []
  'toggle-pick-end': []
  'apply-geojson': []
  'simulate': []
  'export': []
  'toggle-draw': []
  'spacing-change': [value: number]
  'angle-change': [value: number]
  'margin-change': [value: number]
  'show-path-change': [value: boolean]
  'show-waypoints-change': [value: boolean]
  'photo-interval-change': [value: number | null]
  'show-capture-points-change': [value: boolean]
  'update:gimbalYaw': [value: number]
  'lateral-offset-change': [value: number]
}>()

// 旁向重叠率（0-100）
const overlapRate = ref(70) // 默认70%
const headingOverlapLocal = ref(props.headingOverlap ?? 70)
const showCapturePointsLocal = ref(props.showCapturePoints)

// 计算间距：间距 = 2 * 宽度 / (重叠率 + 1)
// 重叠率是百分比，需要转换为小数：重叠率 / 100
const calculatedSpacing = computed(() => {
  if (props.cameraWidth === null || props.cameraWidth <= 0) {
    return null
  }
  const overlapDecimal = overlapRate.value / 100 // 转换为小数，例如 70% -> 0.7
  const spacing = (2 * props.cameraWidth) / (overlapDecimal + 1)
  return spacing
})

const calculatedPhotoInterval = computed(() => {
  if (props.cameraLength === null || props.cameraLength <= 0) {
    return null
  }
  const headingDecimal = headingOverlapLocal.value / 100
  return props.cameraLength * (1 - headingDecimal)
})

// 计算偏移距离：偏移距离 = 高度 * tan(云台垂直夹角)
const calculatedLateralOffset = computed(() => {
  if (props.missionType !== 'oblique' || !props.altitude || props.altitude <= 0) {
    return null
  }
  const tiltRad = ((props.gimbalYaw ?? 0) * Math.PI) / 180
  return props.altitude * Math.tan(tiltRad)
})

// 监听计算出的间距变化，自动更新到父组件
watch(calculatedSpacing, (newSpacing) => {
  if (newSpacing !== null && newSpacing > 0) {
    emit('update:spacing', newSpacing)
    emit('spacing-change', newSpacing)
  }
})

watch(() => props.headingOverlap, (val) => {
  headingOverlapLocal.value = val ?? 0
})

watch(() => props.showCapturePoints, (val) => {
  showCapturePointsLocal.value = val
})

watch(calculatedPhotoInterval, (val) => {
  emit('photo-interval-change', val ?? null)
})

// 监听相机宽度变化，重新计算间距
watch(() => props.cameraWidth, () => {
  if (calculatedSpacing.value !== null && calculatedSpacing.value > 0) {
    emit('update:spacing', calculatedSpacing.value)
    emit('spacing-change', calculatedSpacing.value)
  }
})

// 监听计算出的偏移量变化，自动更新到父组件
watch(calculatedLateralOffset, (newOffset) => {
  if (newOffset !== null && newOffset >= 0) {
    emit('lateral-offset-change', newOffset)
  } else {
    emit('lateral-offset-change', 0)
  }
})

const activeCollapse = ref(['target', 'route', 'results'])
const missionType = computed({
  get: () => props.missionType,
  set: (value: 'mapping' | 'oblique') => {
    emit('update:missionType', value)
    // 切换任务类型时重新计算偏移量
    if (value === 'oblique' && props.altitude && props.altitude > 0) {
      const tiltRad = ((props.gimbalYaw ?? 0) * Math.PI) / 180
      const lateralOffset = props.altitude * Math.tan(tiltRad)
      emit('lateral-offset-change', lateralOffset)
    } else {
      emit('lateral-offset-change', 0)
    }
  },
})

const startPointText = computed(() => {
  if (!props.startPoint) return '未设置'
  return `${props.startPoint[0].toFixed(6)}, ${props.startPoint[1].toFixed(6)}`
})

const endPointText = computed(() => {
  if (!props.endPoint) return '未设置'
  return `${props.endPoint[0].toFixed(6)}, ${props.endPoint[1].toFixed(6)}`
})

function handleTogglePickStart() {
  emit('toggle-pick-start')
}

function handleTogglePickEnd() {
  emit('toggle-pick-end')
}

function handleGeojsonInputChange(val: string) {
  emit('update:geojsonInput', val)
}

function handleSpeedChange(val: number) {
  emit('update:speed', val)
}

function handleApplyGeojson() {
  emit('apply-geojson')
}

function handleOverlapRateChange(value: number) {
  overlapRate.value = value
  // 间距会自动通过 watch 更新
}

function handleAngleChange(value: number) {
  emit('update:angle', value)
  emit('angle-change', value)
}

function handleMarginChange(value: number) {
  emit('update:margin', value)
  emit('margin-change', value)
}

function handleHeadingOverlapChange(value: number) {
  headingOverlapLocal.value = value
  emit('update:headingOverlap', value)
}

function handleShowCapturePointsChange(value: boolean) {
  showCapturePointsLocal.value = value
  emit('update:showCapturePoints', value)
  emit('show-capture-points-change', value)
}

function handleShowPathChange(value: boolean) {
  emit('update:showPath', value)
  emit('show-path-change', value)
}

function handleShowWaypointsChange(value: boolean) {
  emit('update:showWaypoints', value)
  emit('show-waypoints-change', value)
}

function handleSimulate() {
  emit('simulate')
}

function handleExport() {
  emit('export')
}

function handleToggleDraw() {
  emit('toggle-draw')
}

function handleGimbalYawChange(value: number) {
  emit('update:gimbalYaw', value)
  // 计算偏移量：偏移距离 = 高度 * tan(云台垂直夹角)
  if (props.missionType === 'oblique' && props.altitude && props.altitude > 0) {
    const tiltRad = (value * Math.PI) / 180
    const lateralOffset = props.altitude * Math.tan(tiltRad)
    emit('lateral-offset-change', lateralOffset)
  } else {
    emit('lateral-offset-change', 0)
  }
}
</script>

<style scoped>
.route-settings-panel {
  width: 320px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  overflow-x: visible;
}

/* 确保卡片内容不会被裁剪 */
:deep(.el-card__body) {
  overflow: visible;
}

.panel-header {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: #1890ff;
}

.settings-collapse {
  border: none;
}

.coord-text {
  font-size: 12px;
  color: #666;
  font-family: 'JetBrains Mono', 'Monaco', monospace;
  flex: 1;
  word-break: break-all;
}

:deep(.el-collapse-item__header) {
  font-weight: 600;
  padding-left: 0;
}

:deep(.el-collapse-item__content) {
  padding: 16px 0;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

:deep(.el-slider__input) {
  width: 80px;
}

.spacing-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spacing-value {
  font-size: 16px;
  font-weight: 600;
  color: #1890ff;
  font-family: 'JetBrains Mono', 'Monaco', monospace;
}

.spacing-hint {
  font-size: 12px;
  color: #999;
}

:deep(.display-options .el-form-item__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

/* 修复滑块手柄被覆盖的问题 */
:deep(.el-slider__runway) {
  overflow: visible;
}

:deep(.el-slider__button-wrapper) {
  z-index: 10;
  position: relative;
}

:deep(.el-slider__button) {
  z-index: 11;
  position: relative;
}

/* 确保滑块容器不会被裁剪 */
:deep(.el-form-item__content) {
  overflow: visible;
}

/* 确保 collapse 内容区域不会被裁剪 */
:deep(.el-collapse-item__wrap) {
  overflow: visible;
}

:deep(.el-collapse-item__content) {
  overflow: visible;
}
</style>

