<!-- src/App.vue -->
<template>
  <div class="app-container">
    <FlightPlanner :cameraWidth="cameraWidth" :cameraLength="cameraLength" :altitude="altitude" />
    <div class="camera-card-container">
      <CameraCard @width-change="handleWidthChange" @length-change="handleLengthChange" @altitude-change="handleAltitudeChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FlightPlanner from '@/components/FlightPlanner.vue'
import CameraCard from '@/components/CameraCard.vue'

const cameraWidth = ref<number | null>(null)
const cameraLength = ref<number | null>(null)
const altitude = ref(200) // 默认高度200米

function handleWidthChange(width: number | null) {
  cameraWidth.value = width
}

function handleLengthChange(length: number | null) {
  cameraLength.value = length
}

function handleAltitudeChange(alt: number) {
  altitude.value = alt
}
</script>

<style>
body, html, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

.app-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.camera-card-container {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 2000;
}
</style>