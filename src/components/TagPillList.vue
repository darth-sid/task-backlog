<script setup lang="ts">
interface Tag { id: number; name: string; color: string }

const props = defineProps<{
  tagIds: number[]
  tags: Tag[] // TODO: pass a Map<id,Tag> to avoid O(n) find per tag and unnecessary re-renders on unrelated tag edits
  taskId?: number
  draggable?: boolean
}>()

const emit = defineEmits<{
  dragStart: [tagId: number, event: DragEvent, sourceTaskId: number | null]
  dragEnd: []
}>()

function getTag(id: number) { return props.tags.find(t => t.id === id) }
</script>

<template>
  <template v-for="tagId in tagIds" :key="tagId">
    <template v-for="tag in [getTag(tagId)]">
      <span
        v-if="tag"
        class="tag-pill small"
        :draggable="draggable ?? false"
        :style="{ background: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }"
        @dragstart.stop="emit('dragStart', tagId, $event, taskId ?? null)"
        @dragend="emit('dragEnd')"
      >{{ tag.name }}</span>
    </template>
  </template>
</template>

<style scoped>
.tag-pill {
  padding: 3px 10px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.tag-pill.small { padding: 1px 7px; font-size: 10px; cursor: grab; }
.tag-pill.small:active { cursor: grabbing; }
</style>
