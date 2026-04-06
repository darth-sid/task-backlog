<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface Tag {
  id: number
  name: string
  color: string
}

interface Task {
  id: number
  text: string
  deadline: string | null
  tags: number[]
  done: boolean
  createdAt: string
}

type DeadlineStatus = 'overdue' | 'today' | 'soon' | 'later'
type FilterMode = 'active' | 'all' | 'done'

interface FormattedDeadline {
  status: DeadlineStatus
  text: string
}

const TASKS_KEY = 'sid-tasks'
const TAGS_KEY = 'sid-tags'

const PRESET_COLORS: string[] = [
  '#6ab4ff', '#e55', '#e90', '#da0', '#6c6',
  '#c77dff', '#ff6b9d', '#20c997', '#ff8c42', '#778da9',
]

const tasks = ref<Task[]>([])
const tags = ref<Tag[]>([])
const input = ref('')
const deadline = ref('')
const selectedTags = ref<number[]>([])
const filter = ref<FilterMode>('active')
const filterTag = ref<number | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

// Tag creation
const showTagCreator = ref(false)
const newTagName = ref('')
const newTagColor = ref(PRESET_COLORS[0])
const editingTagId = ref<number | null>(null)

onMounted(() => {
  try {
    const savedTasks = localStorage.getItem(TASKS_KEY)
    if (savedTasks) tasks.value = JSON.parse(savedTasks)
    const savedTags = localStorage.getItem(TAGS_KEY)
    if (savedTags) tags.value = JSON.parse(savedTags)
  } catch (e) {
    console.log('No saved data yet')
  }
})

watch(tasks, (val) => {
  localStorage.setItem(TASKS_KEY, JSON.stringify(val))
}, { deep: true })

watch(tags, (val) => {
  localStorage.setItem(TAGS_KEY, JSON.stringify(val))
}, { deep: true })

function formatDate(dateStr: string | null): FormattedDeadline | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { status: 'overdue', text: `${Math.abs(diff)}d overdue` }
  if (diff === 0) return { status: 'today', text: 'Today' }
  if (diff === 1) return { status: 'soon', text: 'Tomorrow' }
  if (diff <= 3) return { status: 'soon', text: `${diff}d` }
  return { status: 'later', text: `${diff}d` }
}

const deadlineColors: Record<DeadlineStatus, string> = {
  overdue: '#e55',
  today: '#e90',
  soon: '#da0',
  later: '#888',
}

const activeCount = computed(() => tasks.value.filter(t => !t.done).length)
const doneCount = computed(() => tasks.value.filter(t => t.done).length)

const sorted = computed(() => {
  let filtered = tasks.value.filter(t => {
    if (filter.value === 'active') return !t.done
    if (filter.value === 'done') return t.done
    return true
  })
  if (filterTag.value) {
    filtered = filtered.filter(t => t.tags?.includes(filterTag.value))
  }
  return [...filtered].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const da = a.deadline ? new Date(a.deadline) : null
    const db = b.deadline ? new Date(b.deadline) : null
    if (da && db) return da - db
    if (da) return -1
    if (db) return 1
    return a.id - b.id
  })
})

function addTask() {
  const text = input.value.trim()
  if (!text) return
  tasks.value.push({
    id: Date.now(),
    text,
    deadline: deadline.value || null,
    tags: [...selectedTags.value],
    done: false,
    createdAt: new Date().toISOString(),
  })
  input.value = ''
  deadline.value = ''
  selectedTags.value = []
  nextTick(() => inputEl.value?.focus())
}

function toggle(id: number): void {
  const task = tasks.value.find(t => t.id === id)
  if (task) task.done = !task.done
}

function remove(id: number): void {
  tasks.value = tasks.value.filter(t => t.id !== id)
}

function clearDone() {
  tasks.value = tasks.value.filter(t => !t.done)
}

function openTagCreator() {
  editingTagId.value = null
  newTagName.value = ''
  const usedColors = tags.value.map(t => t.color)
  newTagColor.value = PRESET_COLORS.find(c => !usedColors.includes(c)) || PRESET_COLORS[0]
  showTagCreator.value = true
}

function editTag(tag: Tag): void {
  editingTagId.value = tag.id
  newTagName.value = tag.name
  newTagColor.value = tag.color
  showTagCreator.value = true
}

function saveTag() {
  const name = newTagName.value.trim()
  if (!name) return
  if (editingTagId.value) {
    const tag = tags.value.find(t => t.id === editingTagId.value)
    if (tag) {
      tag.name = name
      tag.color = newTagColor.value
    }
  } else {
    tags.value.push({ id: Date.now(), name, color: newTagColor.value })
  }
  showTagCreator.value = false
  newTagName.value = ''
  editingTagId.value = null
}

function deleteTag(tagId: number): void {
  tags.value = tags.value.filter(t => t.id !== tagId)
  tasks.value.forEach(task => {
    if (task.tags) task.tags = task.tags.filter(id => id !== tagId)
  })
  selectedTags.value = selectedTags.value.filter(id => id !== tagId)
  if (filterTag.value === tagId) filterTag.value = null
  showTagCreator.value = false
}

function toggleSelectedTag(tagId: number): void {
  const idx = selectedTags.value.indexOf(tagId)
  if (idx >= 0) selectedTags.value.splice(idx, 1)
  else selectedTags.value.push(tagId)
}

function toggleFilterTag(tagId: number): void {
  filterTag.value = filterTag.value === tagId ? null : tagId
}

function getTag(tagId: number): Tag | undefined {
  return tags.value.find(t => t.id === tagId)
}

function borderColor(task: Task): string {
  if (task.done) return 'transparent'
  const dl = formatDate(task.deadline)
  return dl ? deadlineColors[dl.status] : 'transparent'
}

function deadlineColor(task: Task): string {
  if (task.done) return '#888'
  const dl = formatDate(task.deadline)
  return dl ? deadlineColors[dl.status] : '#888'
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1 class="title">tasks</h1>
      <span class="count">{{ activeCount > 0 ? `${activeCount} pending` : 'all clear' }}</span>
    </div>

    <!-- Input -->
    <div class="input-row">
      <input
        ref="inputEl"
        class="text-input"
        placeholder="what needs doing?"
        v-model="input"
        @keydown.enter="addTask"
      />
      <input
        type="date"
        class="date-input"
        v-model="deadline"
        title="Optional deadline"
      />
      <button class="add-btn" @click="addTask" :disabled="!input.trim()">+</button>
    </div>

    <!-- Tag selector -->
    <div class="tag-bar" v-if="tags.length > 0 || showTagCreator">
      <button
        v-for="tag in tags"
        :key="tag.id"
        class="tag-pill selectable"
        :style="{
          background: selectedTags.includes(tag.id) ? tag.color + '25' : 'transparent',
          borderColor: selectedTags.includes(tag.id) ? tag.color + '60' : 'rgba(128,128,128,0.2)',
          color: selectedTags.includes(tag.id) ? tag.color : '#888',
        }"
        @click="toggleSelectedTag(tag.id)"
        @contextmenu.prevent="editTag(tag)"
        title="Click to tag · Right-click to edit"
      >{{ tag.name }}</button>
      <button class="new-tag-btn" @click="openTagCreator" title="Create tag">+</button>
    </div>
    <div v-else class="tag-bar">
      <button class="new-tag-btn-text" @click="openTagCreator">+ create a tag</button>
    </div>

    <!-- Tag creator -->
    <div v-if="showTagCreator" class="tag-creator">
      <div class="tag-creator-inner">
        <div class="tag-creator-header">
          <span class="tag-creator-title">{{ editingTagId ? 'edit tag' : 'new tag' }}</span>
          <button class="tag-creator-close" @click="showTagCreator = false">×</button>
        </div>
        <input
          class="tag-name-input"
          v-model="newTagName"
          placeholder="tag name"
          @keydown.enter="saveTag"
          autofocus
        />
        <div class="color-picker">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            class="color-swatch"
            :class="{ active: newTagColor === color }"
            :style="{ background: color }"
            @click="newTagColor = color"
          />
        </div>
        <div class="tag-creator-preview">
          <span
            class="tag-pill preview"
            :style="{
              background: newTagColor + '25',
              borderColor: newTagColor + '60',
              color: newTagColor,
            }"
          >{{ newTagName || 'preview' }}</span>
        </div>
        <div class="tag-creator-actions">
          <button
            v-if="editingTagId"
            class="tag-delete-btn"
            @click="deleteTag(editingTagId)"
          >delete</button>
          <button
            class="tag-save-btn"
            @click="saveTag"
            :disabled="!newTagName.trim()"
          >{{ editingTagId ? 'save' : 'create' }}</button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <button
        v-for="f in ['active', 'all', 'done']"
        :key="f"
        class="filter-btn"
        :class="{ active: filter === f }"
        @click="filter = f"
      >{{ f }}</button>
      <button
        v-for="tag in tags"
        :key="'filter-' + tag.id"
        class="filter-btn tag-filter"
        :class="{ active: filterTag === tag.id }"
        :style="{
          borderColor: filterTag === tag.id ? tag.color + '60' : undefined,
          color: filterTag === tag.id ? tag.color : undefined,
          background: filterTag === tag.id ? tag.color + '15' : undefined,
        }"
        @click="toggleFilterTag(tag.id)"
      >{{ tag.name }}</button>
      <button v-if="doneCount > 0" class="clear-btn" @click="clearDone">clear done</button>
    </div>

    <!-- Task list -->
    <div class="list">
      <div v-if="sorted.length === 0" class="empty">
        {{ filter === 'done' ? 'nothing completed yet' : filter === 'active' ? 'nothing to do — nice' : 'no tasks yet' }}
      </div>

      <div
        v-for="task in sorted"
        :key="task.id"
        class="task"
        :class="{ 'task-done': task.done }"
        :style="{ borderLeftColor: borderColor(task) }"
      >
        <button
          class="checkbox"
          :class="{ 'checkbox-done': task.done }"
          @click="toggle(task.id)"
        >{{ task.done ? '✓' : '' }}</button>

        <div class="task-content">
          <div class="task-top">
            <span class="task-text" :class="{ 'text-done': task.done }">{{ task.text }}</span>
            <span
              v-if="formatDate(task.deadline)"
              class="deadline"
              :style="{ color: deadlineColor(task) }"
            >{{ formatDate(task.deadline).text }}</span>
          </div>
          <div v-if="task.tags?.length" class="task-tags">
            <span
              v-for="tagId in task.tags"
              :key="tagId"
              class="tag-pill small"
              v-show="getTag(tagId)"
              :style="{
                background: getTag(tagId)?.color + '20',
                color: getTag(tagId)?.color,
                borderColor: getTag(tagId)?.color + '40',
              }"
            >{{ getTag(tagId)?.name }}</span>
          </div>
        </div>

        <button class="remove-btn" @click="remove(task.id)">×</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap');

.container {
  font-family: 'DM Sans', sans-serif;
  max-width: 520px;
  margin: 0 auto;
  padding: 32px 16px;
  min-height: 100vh;
  color: #e0e0e0;
}

.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 24px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  padding-bottom: 12px;
}

.title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.5px;
}

.count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #888;
}

.input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.text-input {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
  color: inherit;
  outline: none;
}

.text-input:focus { border-color: rgba(100, 180, 255, 0.4); }

.date-input {
  padding: 10px;
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
  color: inherit;
  outline: none;
  width: 130px;
}

.date-input:focus { border-color: rgba(100, 180, 255, 0.4); }

.add-btn {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: none;
  background: rgba(100, 180, 255, 0.15);
  color: #6ab4ff;
  font-size: 22px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.add-btn:disabled { opacity: 0.3; cursor: default; }

/* Tag bar */
.tag-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

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

.tag-pill.selectable:hover { opacity: 0.85; }
.tag-pill.small { padding: 1px 7px; font-size: 10px; cursor: default; }
.tag-pill.preview { cursor: default; }

.new-tag-btn {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  border: 1px dashed rgba(128, 128, 128, 0.3);
  background: transparent;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.new-tag-btn:hover { border-color: #6ab4ff; color: #6ab4ff; }

.new-tag-btn-text {
  padding: 3px 10px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px dashed rgba(128, 128, 128, 0.25);
  border-radius: 12px;
  background: transparent;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.new-tag-btn-text:hover { border-color: #6ab4ff; color: #6ab4ff; }

/* Tag creator */
.tag-creator {
  margin-bottom: 16px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 10px;
  background: rgba(30, 30, 35, 0.95);
  overflow: hidden;
}

.tag-creator-inner { padding: 14px; }

.tag-creator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.tag-creator-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #888;
}

.tag-creator-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
}

.tag-name-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
  color: inherit;
  outline: none;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.tag-name-input:focus { border-color: rgba(100, 180, 255, 0.4); }

.color-picker {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.color-swatch.active { border-color: #fff; transform: scale(1.15); }

.tag-creator-preview { margin-bottom: 12px; }

.tag-creator-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.tag-save-btn {
  padding: 6px 16px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  border: none;
  border-radius: 6px;
  background: rgba(100, 180, 255, 0.15);
  color: #6ab4ff;
  cursor: pointer;
}

.tag-save-btn:disabled { opacity: 0.3; cursor: default; }

.tag-delete-btn {
  padding: 6px 16px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  border: none;
  border-radius: 6px;
  background: rgba(255, 100, 100, 0.1);
  color: #e77;
  cursor: pointer;
}

/* Filters */
.filters {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 20px;
  background: transparent;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-btn.active {
  background: rgba(100, 180, 255, 0.12);
  color: #6ab4ff;
  border-color: rgba(100, 180, 255, 0.3);
}

.filter-btn.tag-filter { font-size: 11px; padding: 4px 12px; }

.clear-btn {
  margin-left: auto;
  padding: 5px 12px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  border: none;
  border-radius: 20px;
  background: rgba(255, 100, 100, 0.1);
  color: #e77;
  cursor: pointer;
}

/* Task list */
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #888;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}

.task {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.05);
  border-left: 3px solid transparent;
  transition: all 0.15s;
}

.task-done { opacity: 0.5; }

.checkbox {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1.5px solid rgba(128, 128, 128, 0.35);
  background: transparent;
  color: transparent;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  margin-top: 1px;
}

.checkbox-done {
  background: rgba(100, 200, 130, 0.2);
  border-color: rgba(100, 200, 130, 0.5);
  color: #6c6;
}

.task-content { flex: 1; min-width: 0; }

.task-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.task-text {
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
}

.text-done { text-decoration: line-through; color: #888; }

.deadline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
}

.task-tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.remove-btn {
  background: none;
  border: none;
  color: rgba(128, 128, 128, 0.3);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
  transition: color 0.15s;
  margin-top: 1px;
}

.remove-btn:hover { color: #e55; }
</style>
