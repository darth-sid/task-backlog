<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

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
  pinSlot: number | null
  notes: string
  createdAt: string
}

type DeadlineStatus = 'overdue' | 'today' | 'soon' | 'later'
type FilterMode = 'active' | 'all' | 'done'

interface FormattedDeadline {
  status: DeadlineStatus
  text: string
}

const openPicker = ref<{ type: 'priority' | 'status'; taskId: number } | null>(null)
const expandedTaskId = ref<number | null>(null)
const openPinnedNotesTaskId = ref<number | null>(null)
const draggedTaskId = ref<number | null>(null)
const draggedTagId = ref<number | null>(null)
const draggedTagSourceTaskId = ref<number | null>(null)
const tagDropTaskId = ref<number | null>(null)
const hoveredPinSlot = ref<number | null>(null)
const isPinboardDragActive = ref(false)
const draggedTaskWasPinned = ref(false)
const dragCompletedInPinboard = ref(false)
const pinboardGridEl = ref<HTMLElement | null>(null)
const kanbanDraggedTaskId = ref<number | null>(null)
const kanbanDragOverStatus = ref<Status | null>(null)

const ALL_STATUSES: Status[] = ['unstarted', 'in_progress', 'ready_to_submit', 'done']
const FILTER_MODES: FilterMode[] = ['active', 'all', 'done']
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
  2: ['high', 'medium'],
  3: ['high', 'medium', 'low'],
  4: ['critical', 'high', 'medium', 'low'],
  5: ['critical', 'high', 'medium', 'low', 'minimal'],
}

const todayStr = ref(new Date().toISOString().split('T')[0])
let midnightTimer: ReturnType<typeof setTimeout> | null = null

function scheduleMidnightTick() {
  const now = new Date()
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  midnightTimer = setTimeout(() => {
    todayStr.value = new Date().toISOString().split('T')[0]
    scheduleMidnightTick()
  }, msUntilMidnight)
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
const settings = ref({ priorityCount: 3, showPinboard: true, viewMode: 'list' as 'list' | 'kanban' })
const showSettings = ref(false)

const activePriorities = computed((): Priority[] => {
  return PRIORITY_SETS[settings.value.priorityCount] ?? PRIORITY_SETS[3]
})

function priorityRank(priority: Priority): number {
  return PRIORITY_RANK.get(priority) ?? PRIORITY_RANK.get(DEFAULT_PRIORITY)!
}

function projectPriority(priority: Priority, active: Priority[] = activePriorities.value): Priority {
  if (active.includes(priority)) return priority

  let best = active[0]
  let bestDistance = Infinity

  for (const candidate of active) {
    const distance = Math.abs(priorityRank(candidate) - priorityRank(priority))
    if (distance < bestDistance || (distance === bestDistance && priorityRank(candidate) > priorityRank(best))) {
      best = candidate
      bestDistance = distance
    }
  }

  return best
}

function taskDisplayPriority(task: Task): Priority {
  return projectPriority(task.priority ?? DEFAULT_PRIORITY)
}

// Tag creation
const showTagCreator = ref(false)
const newTagName = ref('')
const newTagColor = ref('#6ab4ff')
const editingTagId = ref<number | null>(null)

onUnmounted(() => {
  if (midnightTimer !== null) clearTimeout(midnightTimer)
  document.removeEventListener('dragover', onDocumentDragOver)
  document.removeEventListener('drop', onDocumentDrop)
})

onMounted(() => {
  scheduleMidnightTick()
  document.addEventListener('dragover', onDocumentDragOver)
  document.addEventListener('drop', onDocumentDrop)
  try {
    const savedTasks = localStorage.getItem(TASKS_KEY)
    if (savedTasks) {
      const parsed = JSON.parse(savedTasks)
      // migrate tasks with legacy done boolean
      let nextLegacyPinSlot = 0
      tasks.value = parsed.map((t: Task & { done?: boolean; pinned?: boolean; pinSlot?: number | null }) => {
        if (!t.status) {
          t.status = t.done ? 'done' : 'unstarted'
        }
        if (!t.startDate) {
          t.startDate = t.createdAt ? t.createdAt.split('T')[0] : today()
        }
        if (t.notes === undefined) t.notes = ''
        if (t.pinSlot === undefined) {
          t.pinSlot = t.pinned && nextLegacyPinSlot < PIN_MAX ? nextLegacyPinSlot++ : null
        }
        if (t.pinSlot !== null && (t.pinSlot < 0 || t.pinSlot >= PIN_MAX)) {
          t.pinSlot = null
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
  // reset new task priority if no longer valid
  if (!active.includes(newPriority.value)) {
    newPriority.value = projectPriority(newPriority.value, active)
  }
})

function today(): string {
  return todayStr.value
}

function daysFromToday(dateStr: string): number {
  const now = new Date(todayStr.value + 'T00:00:00')
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
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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

const PIN_MAX = 6
const PIN_SLOTS = Array.from({ length: PIN_MAX }, (_, i) => i)
const activeCount = computed(() => tasks.value.filter(t => t.status !== 'done' && !isFuture(t)).length)
const doneCount = computed(() => tasks.value.filter(t => t.status === 'done').length)
const pinboardSlots = computed(() => PIN_SLOTS.map(slot => tasks.value.find(t => t.pinSlot === slot) ?? null))
const pinnedCount = computed(() => pinboardSlots.value.filter(Boolean).length)

function compareDueDates(a: Task, b: Task): number {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  if (a.deadline) return -1
  if (b.deadline) return 1
  return 0
}

function compareTasks(a: Task, b: Task): number {
  const aFuture = isFuture(a)
  const bFuture = isFuture(b)
  if (aFuture !== bFuture) return aFuture ? 1 : -1
  const dueDateOrder = compareDueDates(a, b)
  if (dueDateOrder !== 0) return dueDateOrder
  const pa = priorityRank(taskDisplayPriority(a))
  const pb = priorityRank(taskDisplayPriority(b))
  if (pa !== pb) return pa - pb
  return a.id - b.id
}

const sorted = computed(() => {
  let filtered = tasks.value.filter(t => {
    if (settings.value.showPinboard && isPinned(t)) return false
    if (filter.value === 'active') return t.status !== 'done'
    if (filter.value === 'done') return t.status === 'done'
    return true
  })
  if (filterTag.value !== null) {
    const activeTagId = filterTag.value
    filtered = filtered.filter(t => t.tags?.includes(activeTagId))
  }
  return [...filtered].sort((a, b) => {
    const aDone = a.status === 'done'
    const bDone = b.status === 'done'
    if (aDone !== bDone) return aDone ? 1 : -1
    return compareTasks(a, b)
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
    pinSlot: null,
    notes: '',
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
    if (s === 'done' && isPinned(task)) {
      unpinTask(id)
    }
    if (wasDone && s !== 'done') filter.value = 'all'
  }
  openPicker.value = null
}

function remove(id: number): void {
  tasks.value = tasks.value.filter(t => t.id !== id)
  if (expandedTaskId.value === id) expandedTaskId.value = null
  if (draggedTaskId.value === id) draggedTaskId.value = null
}

function isPinned(task: Task): boolean {
  return task.pinSlot !== null
}

function firstOpenPinSlot(excludeTaskId?: number): number | null {
  for (const slot of PIN_SLOTS) {
    const occupant = tasks.value.find(t => t.pinSlot === slot && t.id !== excludeTaskId)
    if (!occupant) return slot
  }
  return null
}

function pinTask(id: number, slot?: number): void {
  const task = tasks.value.find(t => t.id === id)
  if (!task) return
  const targetSlot = slot ?? firstOpenPinSlot(task.id)
  if (targetSlot === null || targetSlot < 0 || targetSlot >= PIN_MAX) return
  if (task.pinSlot === targetSlot) return

  const occupant = tasks.value.find(t => t.pinSlot === targetSlot && t.id !== id)
  if (occupant) {
    if (task.pinSlot !== null) {
      occupant.pinSlot = task.pinSlot
    } else {
      occupant.pinSlot = firstOpenPinSlot(occupant.id)
    }
  }

  task.pinSlot = targetSlot
}

function unpinTask(id: number): void {
  const task = tasks.value.find(t => t.id === id)
  if (!task) return
  task.pinSlot = null
}

function canDropIntoPinSlot(): boolean {
  if (draggedTaskId.value === null) return false
  const draggedTask = tasks.value.find(t => t.id === draggedTaskId.value)
  if (!draggedTask) return false
  return isPinned(draggedTask) || pinnedCount.value < PIN_MAX
}

function onTaskDragStart(taskId: number, event: DragEvent): void {
  if (!settings.value.showPinboard) return
  const task = tasks.value.find(t => t.id === taskId)
  draggedTaskId.value = taskId
  isPinboardDragActive.value = true
  draggedTaskWasPinned.value = !!task && isPinned(task)
  dragCompletedInPinboard.value = false
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(taskId))
  }
}

function onTaskDragEnd(): void {
  if (draggedTaskId.value !== null && draggedTaskWasPinned.value && !dragCompletedInPinboard.value) {
    unpinTask(draggedTaskId.value)
  }
  draggedTaskId.value = null
  hoveredPinSlot.value = null
  isPinboardDragActive.value = false
  draggedTaskWasPinned.value = false
  dragCompletedInPinboard.value = false
}

function onTagDragStart(tagId: number, event: DragEvent, sourceTaskId: number | null = null): void {
  draggedTagId.value = tagId
  draggedTagSourceTaskId.value = sourceTaskId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = sourceTaskId === null ? 'copy' : 'move'
    event.dataTransfer.setData('text/plain', String(tagId))
  }
}

function onTagDragEnd(): void {
  draggedTagId.value = null
  draggedTagSourceTaskId.value = null
  tagDropTaskId.value = null
}

function canDropTagOnTask(taskId: number): boolean {
  if (draggedTagId.value === null) return false
  const task = tasks.value.find(t => t.id === taskId)
  return !!task && !task.tags.includes(draggedTagId.value)
}

function onTaskTagDragOver(taskId: number, event: DragEvent): void {
  if (!canDropTagOnTask(taskId)) return
  event.preventDefault()
  tagDropTaskId.value = taskId
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onTaskTagDragLeave(taskId: number, event: DragEvent): void {
  const relatedTarget = event.relatedTarget as Node | null
  const currentTarget = event.currentTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return
  if (tagDropTaskId.value === taskId) tagDropTaskId.value = null
}

function addTagToTask(taskId: number, tagId: number): void {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task || task.tags.includes(tagId)) return
  task.tags.push(tagId)
}

function removeTagFromTask(taskId: number, tagId: number): void {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return
  task.tags = task.tags.filter(id => id !== tagId)
}

function onTaskTagDrop(taskId: number, event: DragEvent): void {
  if (draggedTagId.value === null || !canDropTagOnTask(taskId)) return
  event.preventDefault()
  addTagToTask(taskId, draggedTagId.value)
  if (draggedTagSourceTaskId.value !== null) {
    removeTagFromTask(draggedTagSourceTaskId.value, draggedTagId.value)
  }
  tagDropTaskId.value = null
}

function onPinSlotDragEnter(slot: number): void {
  hoveredPinSlot.value = canDropIntoPinSlot() ? slot : null
}

function onPinSlotDragOver(slot: number, event: DragEvent): void {
  if (!canDropIntoPinSlot()) return
  event.preventDefault()
  hoveredPinSlot.value = slot
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onPinSlotDrop(slot: number, event: DragEvent): void {
  if (!canDropIntoPinSlot()) return
  event.preventDefault()
  if (draggedTaskId.value === null) return
  pinTask(draggedTaskId.value, slot)
  dragCompletedInPinboard.value = true
  hoveredPinSlot.value = slot
}

function onPinboardDragLeave(event: DragEvent): void {
  const relatedTarget = event.relatedTarget as Node | null
  const currentTarget = event.currentTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return
  hoveredPinSlot.value = null
}

function onDocumentDragOver(event: DragEvent): void {
  if (draggedTagSourceTaskId.value !== null) {
    const target = event.target as Node | null
    const inTaskDropZone = !!target && !!(target as Element).closest?.('.task, .kanban-card, .pin-tile')
    if (!inTaskDropZone) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      tagDropTaskId.value = null
    }
    return
  }
  if (!draggedTaskWasPinned.value) return
  const target = event.target as Node | null
  if (pinboardGridEl.value && target && pinboardGridEl.value.contains(target)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  hoveredPinSlot.value = null
}

function onDocumentDrop(event: DragEvent): void {
  if (draggedTagSourceTaskId.value !== null && draggedTagId.value !== null) {
    const target = event.target as Node | null
    const inTaskDropZone = !!target && !!(target as Element).closest?.('.task, .kanban-card, .pin-tile')
    if (!inTaskDropZone) {
      event.preventDefault()
      removeTagFromTask(draggedTagSourceTaskId.value, draggedTagId.value)
    }
    return
  }
  if (!draggedTaskWasPinned.value || draggedTaskId.value === null) return
  const target = event.target as Node | null
  if (pinboardGridEl.value && target && pinboardGridEl.value.contains(target)) return
  event.preventDefault()
  unpinTask(draggedTaskId.value)
  dragCompletedInPinboard.value = true
}

function toggleExpand(id: number): void {
  openPicker.value = null
  expandedTaskId.value = expandedTaskId.value === id ? null : id
}

function togglePinnedNotes(id: number): void {
  const next = openPinnedNotesTaskId.value === id ? null : id
  closeTransientUi()
  openPinnedNotesTaskId.value = next
}

function closeTransientUi(): void {
  openPicker.value = null
  openPinnedNotesTaskId.value = null
}

function clearDone() {
  tasks.value = tasks.value.filter(t => t.status !== 'done')
}

function openTagCreator() {
  editingTagId.value = null
  newTagName.value = ''
  newTagColor.value = '#6ab4ff'
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

const KANBAN_COLUMN_LABELS: Record<Status, string> = {
  unstarted: 'unstarted',
  in_progress: 'in progress',
  ready_to_submit: 'ready',
  done: 'done',
}

const kanbanColumns = computed((): Record<Status, Task[]> => {
  const map: Record<Status, Task[]> = { unstarted: [], in_progress: [], ready_to_submit: [], done: [] }
  for (const t of tasks.value) {
    if (settings.value.showPinboard && isPinned(t)) continue
    if (filterTag.value !== null && !t.tags?.includes(filterTag.value)) continue
    map[t.status].push(t)
  }
  for (const status of ALL_STATUSES) map[status].sort(compareTasks)
  return map
})

function onKanbanDragStart(taskId: number, e: DragEvent): void {
  kanbanDraggedTaskId.value = taskId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
  }
}

function onKanbanDragEnd(): void {
  kanbanDraggedTaskId.value = null
  kanbanDragOverStatus.value = null
}

function onKanbanColDragOver(status: Status, e: DragEvent): void {
  if (!kanbanDraggedTaskId.value) return
  e.preventDefault()
  kanbanDragOverStatus.value = status
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onKanbanColDrop(status: Status, e: DragEvent): void {
  e.preventDefault()
  if (kanbanDraggedTaskId.value !== null) {
    setStatus(kanbanDraggedTaskId.value, status)
  }
  kanbanDraggedTaskId.value = null
  kanbanDragOverStatus.value = null
}

function onKanbanColDragLeave(e: DragEvent): void {
  const rt = e.relatedTarget as Node | null
  const ct = e.currentTarget as Node | null
  if (ct && rt && ct.contains(rt)) return
  kanbanDragOverStatus.value = null
}
</script>

<template>
  <div class="app-layout">
  <div class="container">
    <div class="header">
      <h1 class="title">tasks</h1>
      <div class="header-right">
        <div class="view-toggle">
          <button
            class="view-btn"
            :class="{ active: settings.viewMode === 'list' }"
            @click="settings.viewMode = 'list'"
            title="List view"
          >list</button>
          <button
            class="view-btn"
            :class="{ active: settings.viewMode === 'kanban' }"
            @click="settings.viewMode = 'kanban'"
            title="Kanban view"
          >kanban</button>
        </div>
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
      <div class="settings-row">
        <span class="settings-label">pinboard</span>
        <div class="settings-control">
          <button
            class="setting-option-btn"
            :class="{ active: settings.showPinboard }"
            @click="settings.showPinboard = !settings.showPinboard"
          >{{ settings.showPinboard ? 'on' : 'off' }}</button>
        </div>
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
        draggable="true"
        @dragstart="onTagDragStart(tag.id, $event)"
        @dragend="onTagDragEnd"
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
        <div class="color-picker-row">
          <div class="color-swatch-preview" :style="{ background: newTagColor }"></div>
          <input type="color" class="color-input-native" v-model="newTagColor" />
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
        v-for="f in FILTER_MODES"
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
    <div v-if="openPicker !== null || openPinnedNotesTaskId !== null" class="picker-overlay" @click="closeTransientUi"></div>

    <!-- Task list -->
    <div v-if="settings.viewMode === 'list'" class="list">
      <div v-if="sorted.length === 0" class="empty">
        {{ filter === 'done' ? 'nothing completed yet' : filter === 'active' ? 'nothing to do — nice' : 'no tasks yet' }}
      </div>

      <div
        v-for="task in sorted"
        :key="task.id"
        class="task"
        :class="{
          'task-done': task.status === 'done',
          'task-future': isFuture(task),
          'task-expanded': expandedTaskId === task.id,
          'task-dragging': draggedTaskId === task.id,
          'task-tag-drop-target': tagDropTaskId === task.id,
        }"
        :style="{ borderLeftColor: borderColor(task), zIndex: openPicker?.taskId === task.id ? 200 : undefined }"
        :draggable="settings.showPinboard"
        @dragstart="onTaskDragStart(task.id, $event)"
        @dragend="onTaskDragEnd"
        @dragover="onTaskTagDragOver(task.id, $event)"
        @dragleave="onTaskTagDragLeave(task.id, $event)"
        @drop.stop="onTaskTagDrop(task.id, $event)"
        @click="toggleExpand(task.id)"
      >
        <div class="status-picker-wrap">
          <button
            type="button"
            class="task-status-btn"
            :style="{ color: STATUS_COLORS[task.status] }"
            :title="`status: ${task.status}`"
            @mousedown.stop
            @click.stop.prevent="togglePicker('status', task.id)"
          >{{ STATUS_LABELS[task.status] }}</button>
          <div v-if="openPicker?.type === 'status' && openPicker.taskId === task.id" class="status-picker" @mousedown.stop @click.stop>
            <button
              v-for="s in ALL_STATUSES"
              :key="s"
              type="button"
              class="status-picker-option"
              :class="{ active: task.status === s }"
              @mousedown.stop
              @click.stop.prevent="setStatus(task.id, s)"
            >
              <span class="status-dot" :style="{ background: STATUS_COLORS[s] }"></span>
              <span>{{ STATUS_LABELS[s] }}</span>
            </button>
          </div>
        </div>

        <div class="priority-picker-wrap">
          <button
            type="button"
            class="task-priority-dot"
            :style="{ background: PRIORITY_COLORS[taskDisplayPriority(task)] }"
            :title="`priority: ${taskDisplayPriority(task)}`"
            @mousedown.stop
            @click.stop.prevent="togglePicker('priority', task.id)"
          ></button>
          <div v-if="openPicker?.type === 'priority' && openPicker.taskId === task.id" class="priority-picker" @mousedown.stop @click.stop>
            <button
              v-for="p in activePriorities"
              :key="p"
              type="button"
              class="priority-picker-option"
              :class="{ active: taskDisplayPriority(task) === p }"
              @mousedown.stop
              @click.stop.prevent="setPriority(task.id, p)"
            >
              <span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span>
              <span>{{ p }}</span>
            </button>
          </div>
        </div>

        <div class="task-content">
          <div class="task-top">
            <span class="task-text" :class="{ 'text-done': task.status === 'done' }">{{ task.text }}</span>
            <span v-if="task.notes" class="notes-indicator" title="has notes">≡</span>
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
              draggable="true"
              @dragstart.stop="onTagDragStart(tagId, $event, task.id)"
              @dragend="onTagDragEnd"
              :style="{
                background: getTag(tagId)?.color + '20',
                color: getTag(tagId)?.color,
                borderColor: getTag(tagId)?.color + '40',
              }"
            >{{ getTag(tagId)?.name }}</span>
          </div>
          <div v-if="expandedTaskId === task.id" class="task-notes" @click.stop>
            <textarea
              class="notes-textarea"
              v-model="task.notes"
              placeholder="add notes..."
              rows="3"
            ></textarea>
          </div>
        </div>

        <span v-if="settings.showPinboard" class="drag-pin-hint" title="Drag to pinboard">⋮⋮</span>
        <button class="remove-btn" @click.stop="remove(task.id)">×</button>
      </div>
    </div>

    <!-- Kanban board -->
    <div v-if="settings.viewMode === 'kanban'" class="kanban-board">
      <div
        v-for="status in ALL_STATUSES"
        :key="status"
        class="kanban-col"
        :class="{ 'kanban-col-dragover': kanbanDragOverStatus === status }"
        @dragover="onKanbanColDragOver(status, $event)"
        @drop="onKanbanColDrop(status, $event)"
        @dragleave="onKanbanColDragLeave"
      >
        <div class="kanban-col-header">
          <span class="kanban-col-label" :style="{ color: STATUS_COLORS[status] }">{{ KANBAN_COLUMN_LABELS[status] }}</span>
          <span class="kanban-col-count">{{ kanbanColumns[status].length }}</span>
        </div>
        <div class="kanban-cards">
          <div v-if="kanbanColumns[status].length === 0" class="kanban-empty">—</div>
          <div
            v-for="task in kanbanColumns[status]"
            :key="task.id"
            class="kanban-card"
            :class="{
              'task-done': task.status === 'done',
              'task-future': isFuture(task),
              'kanban-card-dragging': kanbanDraggedTaskId === task.id,
              'task-tag-drop-target': tagDropTaskId === task.id,
            }"
            :style="{ borderLeftColor: borderColor(task) }"
            draggable="true"
            @dragstart="onKanbanDragStart(task.id, $event)"
            @dragend="onKanbanDragEnd"
            @dragover="onTaskTagDragOver(task.id, $event)"
            @dragleave="onTaskTagDragLeave(task.id, $event)"
            @drop.stop="onTaskTagDrop(task.id, $event)"
          >
            <div class="kanban-card-top">
              <div class="priority-picker-wrap kanban-priority-wrap" @mousedown.stop @click.stop>
                <button
                  type="button"
                  class="task-priority-dot"
                  :style="{ background: PRIORITY_COLORS[taskDisplayPriority(task)] }"
                  :title="`priority: ${taskDisplayPriority(task)}`"
                  @click.stop.prevent="togglePicker('priority', task.id)"
                ></button>
                <div v-if="openPicker?.type === 'priority' && openPicker.taskId === task.id" class="priority-picker kanban-priority-picker" @mousedown.stop @click.stop>
                  <button
                    v-for="p in activePriorities"
                    :key="p"
                    type="button"
                    class="priority-picker-option"
                    :class="{ active: taskDisplayPriority(task) === p }"
                    @mousedown.stop
                    @click.stop.prevent="setPriority(task.id, p)"
                  >
                    <span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span>
                    <span>{{ p }}</span>
                  </button>
                </div>
              </div>
              <span class="kanban-card-text" :class="{ 'text-done': task.status === 'done' }">{{ task.text }}</span>
              <button class="kanban-remove-btn" @click.stop="remove(task.id)" title="Remove">×</button>
            </div>
            <div class="kanban-card-meta">
              <span v-if="isFuture(task)" class="start-label">{{ startLabel(task) }}</span>
              <span
                v-if="task.deadline"
                class="deadline"
                :style="{ color: deadlineColor(task) }"
              >{{ formatDate(task.deadline)!.text }}</span>
            </div>
            <div v-if="task.tags?.length" class="task-tags kanban-tags">
              <span
                v-for="tagId in task.tags"
                :key="tagId"
                class="tag-pill small"
                v-show="getTag(tagId)"
                draggable="true"
                @dragstart.stop="onTagDragStart(tagId, $event, task.id)"
                @dragend="onTagDragEnd"
                :style="{
                  background: getTag(tagId)?.color + '20',
                  color: getTag(tagId)?.color,
                  borderColor: getTag(tagId)?.color + '40',
                }"
              >{{ getTag(tagId)?.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Pinboard sidebar -->
  <div v-if="settings.showPinboard" class="pinboard-sidebar" @click="closeTransientUi">
    <div class="pinboard-sidebar-header">
      <span class="pinboard-label">pinned</span>
      <span v-if="pinnedCount > 0" class="pinboard-count">{{ pinnedCount }}/{{ PIN_MAX }}</span>
    </div>
    <div
      class="pinboard-grid"
      ref="pinboardGridEl"
      :class="{ 'pinboard-grid-active': isPinboardDragActive }"
      @dragleave="onPinboardDragLeave"
    >
      <div
        v-for="(task, slot) in pinboardSlots"
        :key="'pin-slot-' + slot"
        class="pin-slot"
        :class="{
          'pin-slot-filled': !!task,
          'pin-slot-hovered': hoveredPinSlot === slot,
          'pin-slot-droppable': canDropIntoPinSlot(),
        }"
        @dragenter.prevent="onPinSlotDragEnter(slot)"
        @dragover="onPinSlotDragOver(slot, $event)"
        @drop="onPinSlotDrop(slot, $event)"
      >
        <template v-if="task">
          <div
            class="pin-tile"
            :class="{
              'task-done': task.status === 'done',
              'task-future': isFuture(task),
              'pin-tile-expanded': openPinnedNotesTaskId === task.id,
              'task-tag-drop-target': tagDropTaskId === task.id,
            }"
            :style="{ borderLeftColor: borderColor(task), zIndex: openPicker?.taskId === task.id || openPinnedNotesTaskId === task.id ? 200 : undefined }"
            draggable="true"
            @dragstart="onTaskDragStart(task.id, $event)"
            @dragend="onTaskDragEnd"
            @dragover="onTaskTagDragOver(task.id, $event)"
            @dragleave="onTaskTagDragLeave(task.id, $event)"
            @drop.stop="onTaskTagDrop(task.id, $event)"
            @click.stop="togglePinnedNotes(task.id)"
          >
            <div class="pin-tile-content">
              <div class="pin-tile-header">
                <div class="pin-tile-controls">
                  <div class="priority-picker-wrap pin-priority-wrap">
                    <button
                      type="button"
                      class="task-priority-dot"
                      :style="{ background: PRIORITY_COLORS[taskDisplayPriority(task)] }"
                      :title="`priority: ${taskDisplayPriority(task)}`"
                      @mousedown.stop
                      @click.stop.prevent="togglePicker('priority', task.id)"
                    ></button>
                    <div v-if="openPicker?.type === 'priority' && openPicker.taskId === task.id" class="priority-picker pin-priority-picker" @mousedown.stop @click.stop>
                      <button
                        v-for="p in activePriorities"
                        :key="p"
                        type="button"
                        class="priority-picker-option"
                        :class="{ active: taskDisplayPriority(task) === p }"
                        @mousedown.stop
                        @click.stop.prevent="setPriority(task.id, p)"
                      >
                        <span class="priority-dot" :style="{ background: PRIORITY_COLORS[p] }"></span>
                        <span>{{ p }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="pin-tile-actions">
                  <span v-if="task.notes" class="notes-indicator" title="has notes">≡</span>
                  <button class="pin-tile-remove" @click.stop="remove(task.id)" title="Remove">×</button>
                </div>
              </div>

              <div class="pin-tile-main">
                <span class="pin-tile-text" :class="{ 'text-done': task.status === 'done' }">{{ task.text }}</span>
              </div>
              <div class="pin-tile-meta">
                <span v-if="isFuture(task)" class="start-label">{{ startLabel(task) }}</span>
                <span v-if="formatDate(task.deadline)" class="pin-deadline" :style="{ color: deadlineColor(task) }">{{ formatDate(task.deadline)!.text }}</span>
              </div>
              <div class="status-picker-wrap pin-status-wrap pin-status-wrap-bottom">
                <button
                  type="button"
                  class="task-status-btn pin-task-status-btn"
                  :style="{ color: STATUS_COLORS[task.status] }"
                  :title="`status: ${task.status}`"
                  @mousedown.stop
                  @click.stop.prevent="togglePicker('status', task.id)"
                >{{ STATUS_LABELS[task.status] }}</button>
                <div v-if="openPicker?.type === 'status' && openPicker.taskId === task.id" class="status-picker pin-status-picker" @mousedown.stop @click.stop>
                  <button
                    v-for="s in ALL_STATUSES"
                    :key="s"
                    type="button"
                    class="status-picker-option"
                    :class="{ active: task.status === s }"
                    @mousedown.stop
                    @click.stop.prevent="setStatus(task.id, s)"
                  >
                    <span class="status-dot" :style="{ background: STATUS_COLORS[s] }"></span>
                    <span>{{ STATUS_LABELS[s] }}</span>
                  </button>
                </div>
              </div>
              <div v-if="openPinnedNotesTaskId === task.id" class="pin-notes-popup" @click.stop>
                <div class="pin-notes-popup-header">
                  <span class="pin-notes-label">notes</span>
                  <button type="button" class="pin-notes-close" @click.stop="openPinnedNotesTaskId = null">×</button>
                </div>
                <div v-if="task.tags?.length" class="task-tags pin-notes-tags">
                  <span
                    v-for="tagId in task.tags"
                    :key="tagId"
                    class="tag-pill small"
                    v-show="getTag(tagId)"
                    draggable="true"
                    @dragstart.stop="onTagDragStart(tagId, $event, task.id)"
                    @dragend="onTagDragEnd"
                    :style="{
                      background: getTag(tagId)?.color + '20',
                      color: getTag(tagId)?.color,
                      borderColor: getTag(tagId)?.color + '40',
                    }"
                  >{{ getTag(tagId)?.name }}</span>
                </div>
                <textarea
                  class="notes-textarea pin-notes-textarea"
                  v-model="task.notes"
                  placeholder="add notes..."
                  rows="8"
                ></textarea>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="pin-slot-empty">
          <span>{{ slot + 1 }}</span>
        </div>
      </div>
    </div>
  </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap');

.app-layout {
  display: flex;
  gap: 20px;
  width: min(100%, 900px);
  margin: 0 auto;
  padding: 32px 16px;
  align-items: flex-start;
  min-height: 100vh;
  color: #e0e0e0;
  box-sizing: border-box;
}

.container {
  font-family: 'DM Sans', sans-serif;
  flex: 1 1 620px;
  min-width: 0;
  max-width: 620px;
  width: 100%;
  box-sizing: border-box;
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
  flex-wrap: nowrap;
  gap: 8px;
  margin-bottom: 10px;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
}

.text-input {
  flex: 1 1 auto;
  min-width: 190px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
  color: inherit;
  outline: none;
  box-sizing: border-box;
}

.text-input:focus { border-color: rgba(100, 180, 255, 0.4); }

.date-input {
  flex: 0 0 118px;
  padding: 10px 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
  color: inherit;
  outline: none;
  width: 118px;
  min-width: 0;
  box-sizing: border-box;
}

.date-input:focus { border-color: rgba(100, 180, 255, 0.4); }

.date-input-start {
  width: 110px;
  flex-basis: 110px;
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
  box-sizing: border-box;
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
.tag-pill.selectable:active { cursor: grabbing; }
.tag-pill.small { padding: 1px 7px; font-size: 10px; cursor: grab; }
.tag-pill.small:active { cursor: grabbing; }
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

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.color-swatch-preview {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.15);
}

.color-input-native {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
  cursor: pointer;
}

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
  align-items: baseline;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.05);
  border-left: 3px solid transparent;
  transition: all 0.15s;
}

.task-tag-drop-target {
  background: rgba(100, 180, 255, 0.1) !important;
  box-shadow: inset 0 0 0 1px rgba(100, 180, 255, 0.18);
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
}

.task-status-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1;
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
  gap: 2px;
  align-items: center;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 0 4px;
  height: 38px;
  flex: 0 0 auto;
  box-sizing: border-box;
}

.priority-btn {
  width: 16px;
  height: 16px;
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
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: block;
  flex-shrink: 0;
}

@media (max-width: 520px) {
  .input-row {
    flex-wrap: wrap;
  }

  .text-input {
    min-width: 0;
    flex-basis: 100%;
  }

  .date-input,
  .date-input-start,
  .priority-selector {
    flex: 1 1 calc(50% - 4px);
    width: auto;
  }

  .add-btn {
    margin-left: auto;
  }
}

/* Priority dot on task row */
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

.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}

/* Notes */
.task { cursor: pointer; }

.notes-indicator {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #555;
  flex-shrink: 0;
  line-height: 1;
  transition: color 0.15s;
}

.task:hover .notes-indicator { color: #888; }

.task-notes {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}

.notes-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.06);
  color: #ccc;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s;
  line-height: 1.5;
}

.notes-textarea:focus { border-color: rgba(100, 180, 255, 0.35); }
.notes-textarea::placeholder { color: #444; }

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

.task-dragging {
  opacity: 0.28;
  cursor: grabbing;
}

.drag-pin-hint {
  color: rgba(128, 128, 128, 0.28);
  font-size: 13px;
  letter-spacing: -1px;
  padding-top: 3px;
  flex-shrink: 0;
  user-select: none;
}

/* Pinboard sidebar */
.pinboard-sidebar {
  width: 236px;
  flex-shrink: 0;
  position: sticky;
  top: 32px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 4px;
}

.pinboard-sidebar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding-left: 2px;
}

.pinboard-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #555;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pinboard-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3a3a3a;
}

.pinboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 8px;
  border: 1px dashed rgba(128, 128, 128, 0.16);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(128, 128, 128, 0.045), rgba(128, 128, 128, 0.02));
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.pinboard-grid-active {
  border-color: rgba(106, 180, 255, 0.35);
  background:
    linear-gradient(180deg, rgba(106, 180, 255, 0.08), rgba(128, 128, 128, 0.02));
  box-shadow: inset 0 0 0 1px rgba(106, 180, 255, 0.08);
}

.pin-slot {
  min-height: 104px;
  border-radius: 10px;
  border: 1px dashed rgba(128, 128, 128, 0.14);
  background: rgba(128, 128, 128, 0.025);
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.pin-slot-droppable {
  border-color: rgba(106, 180, 255, 0.2);
}

.pin-slot-hovered {
  border-color: rgba(106, 180, 255, 0.45);
  background: rgba(106, 180, 255, 0.08);
  transform: translateY(-1px);
}

.pin-slot-filled {
  border-style: solid;
  border-color: rgba(128, 128, 128, 0.08);
  background: transparent;
}

.pin-slot-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3f4652;
}

.pin-tile {
  position: relative;
  display: block;
  padding: 7px 8px 7px;
  border-radius: 7px;
  background: rgba(128, 128, 128, 0.06);
  border-top: 1px solid rgba(128, 128, 128, 0.1);
  border-right: 1px solid rgba(128, 128, 128, 0.1);
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  border-left: 2px solid transparent;
  transition: background 0.15s;
  overflow: visible;
  min-height: 100%;
  box-sizing: border-box;
}

.pin-tile:hover { background: rgba(128, 128, 128, 0.1); }

.pin-tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.pin-tile-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pin-status-wrap,
.pin-priority-wrap {
  flex-shrink: 0;
  margin-top: 0;
}

.pin-task-status-btn {
  padding: 0;
  font-size: 9px;
  line-height: 1;
}

.pin-status-wrap-bottom {
  margin-top: 6px;
}

.pin-status-picker {
  left: -4px;
  top: auto;
  bottom: calc(100% + 4px);
}

.pin-priority-picker {
  left: 0;
  transform: none;
}

.pin-tile-content {
  min-width: 0;
}

.pin-tile-main {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  justify-content: space-between;
}

.pin-tile-text {
  font-size: 12px;
  line-height: 1.3;
  color: #ccc;
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.pin-tile-meta {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.pin-deadline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  white-space: nowrap;
}

.pin-notes-textarea {
  min-height: 180px;
  resize: vertical;
}

.pin-notes-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.22);
  background: #1c1c22;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
  z-index: 220;
}

.pin-notes-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pin-notes-tags {
  margin-top: 0;
  margin-bottom: 8px;
}

.pin-notes-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #777;
}

.pin-notes-close {
  background: none;
  border: none;
  color: #777;
  font-size: 16px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.pin-tile-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pin-tile-remove {
  background: none;
  border: none;
  color: rgba(128, 128, 128, 0.45);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.45;
  transition: opacity 0.15s, color 0.15s;
}

.pin-tile:hover .pin-tile-remove { opacity: 0.8; }
.pin-tile:hover .notes-indicator { color: #888; }
.pin-tile-remove:hover { opacity: 1 !important; color: #e55; }

/* View toggle */
.view-toggle {
  display: flex;
  gap: 2px;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  padding: 2px;
}

.view-btn {
  padding: 3px 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.view-btn:hover { color: #aaa; }

.view-btn.active {
  background: rgba(100, 180, 255, 0.15);
  color: #6ab4ff;
}

/* Kanban board */
.kanban-board {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  overflow-x: auto;
  padding-bottom: 8px;
}

.kanban-col {
  flex: 1 1 0;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.1);
  background: rgba(128, 128, 128, 0.03);
  padding: 8px;
  transition: border-color 0.15s, background 0.15s;
  min-height: 80px;
}

.kanban-col-dragover {
  border-color: rgba(100, 180, 255, 0.35);
  background: rgba(100, 180, 255, 0.05);
}

.kanban-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  margin-bottom: 2px;
}

.kanban-col-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.kanban-col-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #3a3a3a;
}

.kanban-cards {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.kanban-empty {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #2e2e2e;
  text-align: center;
  padding: 12px 0;
}

.kanban-card {
  padding: 8px 10px;
  border-radius: 7px;
  border-left: 3px solid transparent;
  background: rgba(128, 128, 128, 0.06);
  border-top: 1px solid rgba(128, 128, 128, 0.08);
  border-right: 1px solid rgba(128, 128, 128, 0.08);
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
  transition: background 0.15s, opacity 0.15s;
  cursor: grab;
}

.kanban-card:hover { background: rgba(128, 128, 128, 0.1); }
.kanban-card:active { cursor: grabbing; }

.kanban-card-dragging {
  opacity: 0.3;
  cursor: grabbing;
}

.kanban-card-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.kanban-priority-wrap {
  flex-shrink: 0;
  margin-top: 4px;
}

.kanban-priority-picker {
  left: 0;
  transform: none;
  top: 14px;
}

.kanban-card-text {
  font-size: 12px;
  line-height: 1.35;
  color: #ccc;
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.kanban-remove-btn {
  background: none;
  border: none;
  color: rgba(128, 128, 128, 0.0);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  line-height: 1;
  transition: color 0.15s;
}

.kanban-card:hover .kanban-remove-btn { color: rgba(128, 128, 128, 0.4); }
.kanban-remove-btn:hover { color: #e55 !important; }

.kanban-card-meta {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 4px;
  flex-wrap: wrap;
}

.kanban-tags {
  margin-top: 5px;
}

@media (max-width: 900px) {
  .app-layout {
    flex-direction: column;
    width: min(100%, 640px);
  }

  .container {
    max-width: none;
  }

  .pinboard-sidebar {
    position: static;
    width: 100%;
    order: -1;
  }
}

</style>
