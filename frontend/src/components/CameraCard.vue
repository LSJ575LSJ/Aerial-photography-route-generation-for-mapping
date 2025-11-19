<template>
  <div class="camera-card">
    <el-card shadow="hover">
      <div class="card-title">相机参数</div>
      <el-form label-position="top" :model="form">
        <el-form-item label="飞行高度 (m)">
          <el-input-number
            v-model="form.altitude"
            :min="0"
            :step="10"
            controls-position="right"
            placeholder="请输入飞行高度"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="相机画幅宽度 (mm)">
          <el-input-number
            v-model="form.sensorWidth"
            :min="0"
            :step="1"
            controls-position="right"
            placeholder="请输入画幅宽度"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="相机画幅长度 (mm)">
          <el-input-number
            v-model="form.sensorLength"
            :min="0"
            :step="1"
            controls-position="right"
            placeholder="请输入画幅长度"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="焦距 (mm)">
          <el-input-number
            v-model="form.focalLength"
            :min="0"
            :step="1"
            controls-position="right"
            placeholder="请输入焦距"
            class="full-width"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="full-width" @click="handleCalculate">
            计算可拍摄信息
          </el-button>
        </el-form-item>
      </el-form>

      <el-divider />

      <div class="result">
        <span>可拍摄宽度：</span>
        <span class="value">
          {{ formattedWidth }}
        </span>
      </div>
      <div class="result">
        <span>可拍摄长度：</span>
        <span class="value">
          {{ formattedLength }}
        </span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

interface CameraForm {
  altitude: number
  sensorWidth: number
  sensorLength: number
  focalLength: number
}

const form = reactive<CameraForm>({
  altitude: 200, // 默认飞行高度 (米)
  sensorWidth: 36, // 默认画幅 (mm) - 全画幅
  sensorLength: 24, // 默认画幅长度 (mm)
  focalLength: 35 // 默认焦距 (mm)
})

const groundWidth = ref<number | null>(null)
const groundLength = ref<number | null>(null)

const emit = defineEmits<{
  'width-change': [width: number | null]
  'length-change': [length: number | null]
  'altitude-change': [altitude: number]
}>()

function handleCalculate() {
  const { altitude, sensorWidth, sensorLength, focalLength } = form

  if (altitude <= 0 || sensorWidth <= 0 || sensorLength <= 0 || focalLength <= 0) {
    ElMessage.warning('请确保高度、画幅和焦距都大于 0')
    return
  }

  // 依据相似三角形：groundWidth = altitude * sensorWidth / focalLength
  // altitude 单位为米，需要换算成毫米再计算
  const altitudeMm = altitude * 1000
  const widthMm = altitudeMm * (sensorWidth / focalLength)
  const lengthMm = altitudeMm * (sensorLength / focalLength)
  const widthMeters = widthMm / 1000
  const lengthMeters = lengthMm / 1000

  groundWidth.value = widthMeters
  groundLength.value = lengthMeters
  emit('width-change', widthMeters)
  emit('length-change', lengthMeters)
}

// 监听宽度变化，自动通知父组件
watch(groundWidth, (newWidth) => {
  emit('width-change', newWidth)
})

watch(groundLength, (newLength) => {
  emit('length-change', newLength)
})

// 监听高度变化，自动通知父组件
watch(() => form.altitude, (newAltitude) => {
  emit('altitude-change', newAltitude)
})

const formattedWidth = computed(() => {
  if (groundWidth.value === null) {
    return '未计算'
  }
  if (!Number.isFinite(groundWidth.value)) {
    return '计算错误'
  }
  return `${groundWidth.value.toFixed(2)} m`
})

const formattedLength = computed(() => {
  if (groundLength.value === null) {
    return '未计算'
  }
  if (!Number.isFinite(groundLength.value)) {
    return '计算错误'
  }
  return `${groundLength.value.toFixed(2)} m`
})

// 初始化时计算一次
handleCalculate()
</script>

<style scoped>
.camera-card {
  width: 320px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.full-width {
  width: 100%;
}

.result {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #444;
}

.result .value {
  font-weight: 600;
  color: #1890ff;
}
</style>




