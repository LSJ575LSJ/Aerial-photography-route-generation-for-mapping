<!-- src/App.vue -->
<template>
  <div class="app-container">
    <FlightPlanner :cameraWidth="cameraWidth" :cameraLength="cameraLength" />
    <div class="camera-card-container">
      <CameraCard @width-change="handleWidthChange" @length-change="handleLengthChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FlightPlanner from '@/components/FlightPlanner.vue'
import CameraCard from '@/components/CameraCard.vue'

const cameraWidth = ref<number | null>(null)
const cameraLength = ref<number | null>(null)

function handleWidthChange(width: number | null) {
  cameraWidth.value = width
}

function handleLengthChange(length: number | null) {
  cameraLength.value = length
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