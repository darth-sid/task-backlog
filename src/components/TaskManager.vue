<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface Tag {
  id: number
  name: string
  color: string
}

type Priority = 'critical' | 'high' | 'medium' | 'low' | 'minimal'
type Status = 'unstarted' | 'in_progress' | 'ready_to_submit' | 'done'

interface Task {
  id: number
  text: string
  deadline: string | null
  startDate: string
  tags: number[]
  status: Status
  priority: Priority
  createdAt: string
}

type DeadlineStatus = 'overdue' | 'today' | 'soon' | 'later'
type FilterMode = 'active' | 'all' | 'done'

interface FormattedDeadline {
  status: DeadlineStatus
  text: string
}

const openPicker = ref<{ type: 'priority' | 'status'; taskId: number } | null>(null)

const ALL_STATUSES: Status[] = ['unstarted', 'in_progress', 'ready_to_submit', 'done']
const STATUS_LABELS: Record<Status, string> = {
  unstarted: '—',
  in_progress: 'wip',
  ready_to_submit: 'ready',
  done: 'done',
}
const STATUS_COLORS: Record<Status, string> = {
  unstarted: '#444',
  in_progress: '#778da9',
  ready_to_submit: '#da0',
  done: '#6c6',
}

const TASKS_KEY = 'sid-tasks'
const TAGS_KEY = 'sid-tags'
const SETTINGS_KEY = 'sid-settings'

const PRESET_COLORS: string[] = [
  '#6ab4ff', '#e55', '#e90', '#da0', '#6c6',
  '#c77dff', '#ff6b9d', '#20c997', '#ff8c42', '#778da9',
]

const DEFAULT_PRIORITY: Priority = 'medium'
const ALL_PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low', 'minimal']
const PRIORITY_RANK = new Map(ALL_PRIORITIES.map((p, i) => [p, i] as const))
const PRIORITY_COLORS: Record<Priority, string> = {
  critical: '#ff2255',
  high: '#e55',
  medium: '#da0',
  low: '#6ab4ff',
  minimal: '#778da9',
}
const PRIORITY_SETS: Record<number, Priority[]> = {
  1: ['medium'],
  2: ['high', 'low'],
  3: ['high', 'medium', 'low'],
  4: ['critical', 'high', 'low', 'minimal'],
  5: ['critical', 'high', 'medium', 'low', 'minimal'],
}

const tasks = ref<Task[]>([])
const tags = ref<Tag[]>([])
const input = ref('')
const deadline = ref('')
const newStartDate = ref('')
const newPriority = ref<Priority>('medium')
const selectedTags = ref<number[]>([])
const filter = ref<FilterMode>('active')
const filterTag = ref<number | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

// Settings
const settings = ref({ priorityCount: 3 })
const showSettings = ref(false)

const activePriorities = computed((): Priority[] => {
  return PRIORITY_SETS[settings.value.priorityCount] ?? PRIORITY_SETS[3]
})

// Tag creation
const showTagCreator = ref(false)
const newTagName = ref('')
const newTagColor = ref(PRESET_COLORS[0])
const editingTagId = ref<number | null>(null)

onMounted(() => {
  try {
    const savedTasks = localStorage.getItem(TASKS_KEY)
    if (savedTasks) {
      const parsed = JSON.parse(savedTasks)
      // migrate tasks with legacy done boolean
      tasks.value = parsed.map((t: Task & { done?: boolean }) => {
        if (!t.status) {
          t.status = t.done ? 'done' : 'unstarted'
        }
        if (!t.startDate) {
          t.startDate = t.createdAt ? t.createdAt.split('T')[0] : today()
        }
        return t
      })
    }
    const savedTags = localStorage.getItem(TAGS_KEY)
    if (savedTags) tags.value = JSON.parse(savedTags)
    const savedSettings = localStorage.getItem(SETTINGS_KEY)
    if (savedSettings) settings.value = { ...settings.value, ...JSON.parse(savedSettings) }
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

watch(settings, (val) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(val))
}, { deep: true })

watch(activePriorities, (active) => {
  // migrate tasks whose priority was removed
  tasks.value.forEach(task => {
    if (!active.includes(task.priority ?? DEFAULT_PRIORITY)) {
      task.priority = active[active.length - 1]
    }
  })
  // reset new task priority if no longer valid
  if (!active.includes(newPriority.value)) {
    newPriority.value = active[Math.floor((active.length - 1) / 2)]
  }
})

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function daysFromToday(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function isFuture(task: Task): boolean {
  return !!task.startDate && daysFromToday(task.startDate) > 0
}

function startLabel(task: Task): string | null {
  if (!task.startDate) return null
  const diff = daysFromToday(task.startDate)
  return diff > 0 ? `starts in ${diff}d` : null
}

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

const activeCount = computed(() => tasks.value.filter(t => t.status !== 'done').length)
const doneCount = computed(() => tasks.value.filter(t => t.status === 'done').length)

function deadlineRank(task: Task): number {
  const dl = formatDate(task.deadline)
  if (!dl) return 4
  if (dl.status === 'overdue') return 0
  if (dl.status === 'today') return 1
  if (dl.status === 'soon') return 2
  return 3
}

const sorted = computed(() => {
  let filtered = tasks.value.filter(t => {
    if (filter.value === 'active') return t.status !== 'done'
    if (filter.value === 'done') return t.status === 'done'
    return true
  })
  if (filterTag.value) {
    filtered = filtered.filter(t => t.tags?.includes(filterTag.value))
  }
  return [...filtered].sort((a, b) => {
    const aDone = a.status === 'done'
    const bDone = b.status === 'done'
    if (aDone !== bDone) return aDone ? 1 : -1
    const aFuture = isFuture(a)
    const bFuture = isFuture(b)
    if (aFuture !== bFuture) return aFuture ? 1 : -1
    const pa = PRIORITY_RANK.get(a.priority ?? DEFAULT_PRIORITY)!
    const pb = PRIORITY_RANK.get(b.priority ?? DEFAULT_PRIORITY)!
    if (pa !== pb) return pa - pb
    const ra = deadlineRank(a)
    const rb = deadlineRank(b)
    if (ra !== rb) return ra - rb
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
    startDate: newStartDate.value || today(),
    tags: [...selectedTags.value],
    status: 'unstarted',
    priority: newPriority.value,
    createdAt: new Date().toISOString(),
  })
  input.value = ''
  deadline.value = ''
  newStartDate.value = ''
  selectedTags.value = []
  nextTick(() => inputEl.value?.focus())
}

function togglePicker(type: 'priority' | 'status', taskId: number): void {
  if (openPicker.value?.type === type && openPicker.value.taskId === taskId) {
    openPicker.value = null
  } else {
    openPicker.value = { type, taskId }
  }
}

function setPriority(id: number, p: Priority): void {
  const task = tasks.value.find(t => t.id === id)
  if (task) task.priority = p
  openPicker.value = null
}

function setStatus(id: number, s: Status): void {
  const task = tasks.value.find(t => t.id === id)
  if (task) {
    const wasDone = task.status === 'done'
    task.status = s
    if (wasDone && s !== 'done') filter.value = 'all'
  }
  openPicker.value = null
}

function remove(id: number): void {
  tasks.value = tasks.value.filter(t => t.id !== id)
}

function clearDone() {
  tasks.value = tasks.value.filter(t => t.status !== 'done')
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
  if (task.status === 'done' || isFuture(task)) return 'transparent'
  const dl = formatDate(task.deadline)
  return dl ? deadlineColors[dl.status] : 'transparent'
}

function deadlineColor(task: Task): string {
  if (task.status === 'done') return '#888'
  const dl = formatDate(task.deadline)
  return dl ? deadlineColors[dl.status] : '#888'
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1 class="title">tasks</h1>
      <div class="header-right">
        <span class="count">{{ activeCount > 0 ? `${activeCount} pending` : 'all clear' }}</span>
        <button class="settings-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings" title="Settings">⚙</button>
      </div>
    </div>

    <!-- Settings panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="settings-row">
        <span class="settings-label">priority levels</span>
        <div class="settings-control">
          <button
            v-for="n in [1, 2, 3, 4, 5]"
            :key="n"
            class="setting-option-btn"
            :class="{ active: settings.priorityCount === n }"
            @click="settings.priorityCount = n"
          >{{ n }}</button>
        </div>
        <span class="settings-hint">{{ activePriorities.join(' · ') }}</span>
      </div>
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
        class="date-input date-input-start"
        :class="{ 'has-value': newStartDate }"
        v-model="newStartDate"
        :min="today()"
        title="Start date (optional)"
      />
      <input
        type="date"
        class="date-input"
        v-model="deadline"
        title="Optional deadline"
      />
      <div class="priority-selector">
        <button
          v-for="p in activePriorities"
          :key="p"
          class="priority-btn"
          :class="{ active: newPriority === p }"
          :style="{ '--dot-color': PRIORITY_COLORS[p] }"
          :title="p"
          @click="newPriority = p"
        ><span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span></button>
      </div>
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

    <!-- Picker overlay -->
    <div v-if="openPicker !== null" class="picker-overlay" @click="openPicker = null"></div>

    <!-- Task list -->
    <div class="list">
      <div v-if="sorted.length === 0" class="empty">
        {{ filter === 'done' ? 'nothing completed yet' : filter === 'active' ? 'nothing to do — nice' : 'no tasks yet' }}
      </div>

      <div
        v-for="task in sorted"
        :key="task.id"
        class="task"
        :class="{ 'task-done': task.status === 'done', 'task-future': isFuture(task) }"
        :style="{ borderLeftColor: borderColor(task), zIndex: openPicker?.taskId === task.id ? 200 : undefined }"
      >
        <div class="status-picker-wrap">
          <button
            class="task-status-btn"
            :style="{ color: STATUS_COLORS[task.status] }"
            :title="`status: ${task.status}`"
            @click.stop="togglePicker('status', task.id)"
          >{{ STATUS_LABELS[task.status] }}</button>
          <div v-if="openPicker?.type === 'status' && openPicker.taskId === task.id" class="status-picker" @click.stop>
            <button
              v-for="s in ALL_STATUSES"
              :key="s"
              class="status-picker-option"
              :class="{ active: task.status === s }"
              @click="setStatus(task.id, s)"
            >
              <span class="status-dot" :style="{ background: STATUS_COLORS[s] }"></span>
              <span>{{ STATUS_LABELS[s] }}</span>
            </button>
          </div>
        </div>

        <div class="priority-picker-wrap">
          <button
            class="task-priority-dot"
            :style="{ background: PRIORITY_COLORS[task.priority ?? DEFAULT_PRIORITY] }"
            :title="`priority: ${task.priority ?? DEFAULT_PRIORITY}`"
            @click.stop="togglePicker('priority', task.id)"
          ></button>
          <div v-if="openPicker?.type === 'priority' && openPicker.taskId === task.id" class="priority-picker" @click.stop>
            <button
              v-for="p in activePriorities"
              :key="p"
              class="priority-picker-option"
              :class="{ active: (task.priority ?? DEFAULT_PRIORITY) === p }"
              @click="setPriority(task.id, p)"
            >
              <span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span>
              <span>{{ p }}</span>
            </button>
          </div>
        </div>

        <div class="task-content">
          <div class="task-top">
            <span class="task-text" :class="{ 'text-done': task.status === 'done' }">{{ task.text }}</span>
            <span v-if="isFuture(task)" class="start-label">{{ startLabel(task) }}</span>
            <span
              v-if="formatDate(task.deadline)"
              class="deadline"
              :style="{ color: deadlineColor(task) }"
            >{{ formatDate(task.deadline)!.text }}</span>
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

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-btn {
  background: none;
  border: none;
  color: #555;
  font-size: 15px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
  line-height: 1;
}

.settings-btn:hover,
.settings-btn.active { color: #aaa; }

.settings-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.04);
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
}

.settings-control {
  display: flex;
  gap: 3px;
}

.setting-option-btn {
  width: 28px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: transparent;
  color: #888;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.setting-option-btn:hover { border-color: rgba(128, 128, 128, 0.4); color: #bbb; }

.setting-option-btn.active {
  background: rgba(100, 180, 255, 0.12);
  border-color: rgba(100, 180, 255, 0.35);
  color: #6ab4ff;
}

.settings-hint {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #444;
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

.date-input-start {
  width: 110px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.date-input-start:focus,
.date-input-start.has-value { opacity: 1; }

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
  position: relative;
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
.task-future { opacity: 0.4; }

.start-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #666;
  flex-shrink: 0;
  white-space: nowrap;
}

.status-picker-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: 2px;
}

.task-status-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s;
  opacity: 0.7;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.task-status-btn:hover { opacity: 1; background: rgba(128, 128, 128, 0.1); }

.status-picker {
  position: absolute;
  left: 0;
  top: 20px;
  background: #1c1c22;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 4px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 130px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.status-picker-option {
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

.status-picker-option:hover { background: rgba(128, 128, 128, 0.15); color: #e0e0e0; }
.status-picker-option.active { color: #e0e0e0; background: rgba(128, 128, 128, 0.12); }

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: block;
  flex-shrink: 0;
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

/* Priority selector (input row) */
.priority-selector {
  display: flex;
  gap: 3px;
  align-items: center;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 0 6px;
  height: 42px;
}

.priority-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s;
  opacity: 0.4;
}

.priority-btn.active {
  border-color: var(--dot-color);
  opacity: 1;
}

.priority-btn:hover { opacity: 0.8; }

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
  flex-shrink: 0;
}

/* Priority dot on task row */
.priority-picker-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: 7px;
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

.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
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

</style>
