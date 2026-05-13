<script setup lang="ts">
type Priority = 'critical' | 'high' | 'medium' | 'low' | 'minimal'

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: '#ff2255',
  high: '#e55',
  medium: '#da0',
  low: '#6ab4ff',
  minimal: '#778da9',
}

defineProps<{
  displayPriority: Priority
  activePriorities: Priority[]
  isOpen: boolean
  wrapClass?: string
  pickerClass?: string
}>()

defineEmits<{
  toggle: []
  select: [p: Priority]
}>()
</script>

<template>
  <div class="priority-picker-wrap" :class="wrapClass" @mousedown.stop @click.stop>
    <button
      type="button"
      class="task-priority-dot"
      :style="{ background: PRIORITY_COLORS[displayPriority] }"
      :title="`priority: ${displayPriority}`"
      @click.stop.prevent="$emit('toggle')"
    ></button>
    <div v-if="isOpen" class="priority-picker" :class="pickerClass" @mousedown.stop @click.stop>
      <button
        v-for="p in activePriorities"
        :key="p"
        type="button"
        class="priority-picker-option"
        :class="{ active: displayPriority === p }"
        @mousedown.stop
        @click.stop.prevent="$emit('select', p)"
      >
        <span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span>
        <span>{{ p }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.priority-picker-wrap {
  position: relative;
  flex-shrink: 0;
}

.task-priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  display: block;
  transition: transform 0.15s, opacity 0.15s;
  opacity: 0.8;
}

.task-priority-dot:hover {
  transform: scale(1.4);
  opacity: 1;
}

.priority-picker {
  position: absolute;
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  background: #1c1c22;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 4px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 110px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.priority-picker-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: #aaa;
  cursor: pointer;
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  text-align: left;
  transition: background 0.1s;
  width: 100%;
}

.priority-picker-option:hover { background: rgba(128, 128, 128, 0.15); color: #e0e0e0; }
.priority-picker-option.active { color: #e0e0e0; background: rgba(128, 128, 128, 0.12); }

.priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: block;
  flex-shrink: 0;
}

/* Kanban variant */
.kanban-priority-wrap {
  flex-shrink: 0;
  margin-top: 4px;
}

.kanban-priority-picker {
  left: 0;
  transform: none;
  top: 14px;
}

/* Pinboard variant */
.pin-priority-wrap {
  flex-shrink: 0;
  margin-top: 0;
}

.pin-priority-picker {
  left: 0;
  transform: none;
}
</style>
