"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"

type PhotoRow = {
  id: string
  title: string
  image_url: string
  labels: string[] | string | null
  created_at: string
}

type PhotoWithMeta = PhotoRow & {
  width: number
  height: number
}

const COUNTRY_LABELS = [
  "benin",
  "ghana",
  "togo",
  "ivory coast",
  "sierra leone",
  "liberia",
  "guinea",
  "guinea-bissau",
  "gambia",
  "senegal",
  "burkina faso",
  "mali",
  "niger",
  "nigeria",
  "cape verde",
  "mauritania",
] as const

function parseLabels(labels: PhotoRow["labels"]): string[] {
  if (Array.isArray(labels)) {
    return labels.map((label) => String(label).trim().toLowerCase()).filter(Boolean)
  }

  if (typeof labels === "string" && labels.trim()) {
    try {
      const parsed = JSON.parse(labels)
      if (Array.isArray(parsed)) {
        return parsed.map((label) => String(label).trim().toLowerCase()).filter(Boolean)
      }
      return [labels.trim().toLowerCase()]
    } catch {
      return labels
        .split(",")
        .map((label) => label.trim().toLowerCase())
        .filter(Boolean)
    }
  }

  return []
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
}

function shuffleArray<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function Home() {
  const [photos, setPhotos] = useState<PhotoWithMeta[]>([])
  const [selectedCountry, setSelectedCountry] = useState("")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [selectedUploadLabels, setSelectedUploadLabels] = useState<string[]>([])
  const [activePhoto, setActivePhoto] = useState<PhotoRow | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [titleInput, setTitleInput] = useState("")
  const [labelInput, setLabelInput] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [showOverlayInfo, setShowOverlayInfo] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState("")
  const [editLabelInput, setEditLabelInput] = useState("")
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [headerFaded, setHeaderFaded] = useState(false)
  const [isShuffled, setIsShuffled] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [isShuffleAnimating, setIsShuffleAnimating] = useState(false)

  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const lastScrollYRef = useRef(0)
  const imageMetaCacheRef = useRef<Record<string, { width: number; height: number }>>({})

  const previewUrl = useMemo(() => {
    if (!selectedFile) return ""
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    void loadPhotos()
  }, [])

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none), (pointer: coarse)").matches)
    const params = new URLSearchParams(window.location.search)
    setIsAdminMode(params.get("admin") === "true")
  }, [])

  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY
      const diff = currentY - lastScrollYRef.current

      if (currentY < 40) {
        setHeaderVisible(true)
        setHeaderFaded(false)
      } else if (diff > 8) {
        setHeaderVisible(false)
        setHeaderFaded(true)
      } else if (diff < -8) {
        setHeaderVisible(true)
        setHeaderFaded(currentY > 120)
      }

      lastScrollYRef.current = currentY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (!activePhoto) return

    if (isTouchDevice) {
      setShowOverlayInfo(true)
    } else {
      setShowOverlayInfo(!!editingPhotoId)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (editingPhotoId) {
          closeEditPanel()
          return
        }
        setActivePhoto(null)
      }

      if (!editingPhotoId) {
        if (event.key === "ArrowRight") showNextPhoto()
        if (event.key === "ArrowLeft") showPreviousPhoto()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
    }
  }, [activePhoto, isTouchDevice, editingPhotoId])

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isShuffleAnimating) return
    const timeout = setTimeout(() => setIsShuffleAnimating(false), 520)
    return () => clearTimeout(timeout)
  }, [isShuffleAnimating])

  const allLabels = useMemo(() => {
    const values = photos.flatMap((photo) => parseLabels(photo.labels))
    return Array.from(new Set(values)).sort()
  }, [photos])

  const countryOptions = useMemo(
    () => allLabels.filter((label) => COUNTRY_LABELS.includes(label as (typeof COUNTRY_LABELS)[number])),
    [allLabels]
  )

  const subjectOptions = useMemo(
    () => allLabels.filter((label) => !COUNTRY_LABELS.includes(label as (typeof COUNTRY_LABELS)[number])),
    [allLabels]
  )

  const orderedPhotos = useMemo(() => {
    if (!isShuffled) return photos
    const keyed = photos.map((photo) => ({ ...photo, _key: `${photo.id}-${shuffleSeed}` }))
    return shuffleArray(keyed).map(({ _key, ...photo }) => photo)
  }, [photos, isShuffled, shuffleSeed])

  const filteredPhotos = orderedPhotos.filter((photo) => {
    const photoLabels = parseLabels(photo.labels)
    const matchesCountry = !selectedCountry || photoLabels.includes(selectedCountry)
    const matchesSubjects = selectedSubjects.every((label) => photoLabels.includes(label))
    return matchesCountry && matchesSubjects
  })

  function showStatus(message: string) {
    setStatusMessage(message)
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(""), 2200)
  }

  async function readImageSize(url: string) {
    const cached = imageMetaCacheRef.current[url]
    if (cached) return cached

    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 900 })
      img.onerror = () => resolve({ width: 1200, height: 900 })
      img.src = url
    })

    imageMetaCacheRef.current[url] = size
    return size
  }

  async function loadPhotos() {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase loadPhotos error:", error)
      return [] as PhotoWithMeta[]
    }

    const rows = (data ?? []) as PhotoRow[]
    const withMeta = await Promise.all(
      rows.map(async (photo) => {
        const meta = await readImageSize(photo.image_url)
        return {
          ...photo,
          width: meta.width,
          height: meta.height,
        }
      })
    )

    setPhotos(withMeta)
    return withMeta
  }

  function toggleUploadLabel(label: string) {
    setSelectedUploadLabels((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    )
  }

  function toggleSubject(label: string) {
    setSelectedSubjects((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    )
  }

  function clearFilters() {
    setSelectedCountry("")
    setSelectedSubjects([])
  }

  function toggleShuffle() {
    setIsShuffleAnimating(true)
    window.setTimeout(() => {
      setShuffleSeed(Date.now())
      setIsShuffled((current) => !current)
    }, 110)
  }

  function revealOverlayInfo() {
    setShowOverlayInfo(true)

    if (isTouchDevice || editingPhotoId) return

    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
    overlayTimeoutRef.current = setTimeout(() => setShowOverlayInfo(false), 1200)
  }

  function hideOverlayInfoSoon() {
    if (isTouchDevice || editingPhotoId) return

    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
    overlayTimeoutRef.current = setTimeout(() => setShowOverlayInfo(false), 650)
  }

  function currentPhotoIndex() {
    if (!activePhoto) return -1
    return filteredPhotos.findIndex((photo) => photo.id === activePhoto.id)
  }

  function showNextPhoto() {
    if (!activePhoto || filteredPhotos.length < 2) return
    const currentIndex = currentPhotoIndex()
    if (currentIndex === -1) return
    const nextIndex = (currentIndex + 1) % filteredPhotos.length
    setActivePhoto(filteredPhotos[nextIndex])
    closeEditPanel()
  }

  function showPreviousPhoto() {
    if (!activePhoto || filteredPhotos.length < 2) return
    const currentIndex = currentPhotoIndex()
    if (currentIndex === -1) return
    const previousIndex = (currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length
    setActivePhoto(filteredPhotos[previousIndex])
    closeEditPanel()
  }

  function selectFile(file: File | null) {
    if (!file) return
    setSelectedFile(file)
    setTitleInput((current) => current || titleFromFileName(file.name))
    setIsDraggingFile(false)
  }

  async function submitUpload() {
    if (!selectedFile) {
      alert("Please choose a photo first")
      return
    }

    setIsUploading(true)

    const fileName = `${Date.now()}_${selectedFile.name}`
    const { error: uploadError } = await supabase.storage.from("photos").upload(fileName, selectedFile)

    if (uploadError) {
      console.error(uploadError)
      setIsUploading(false)
      alert("Upload failed")
      return
    }

    const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${fileName}`

    const typedLabels = labelInput
      .split(",")
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean)

    const labels = Array.from(new Set([...selectedUploadLabels, ...typedLabels]))

    const { error: insertError } = await supabase.from("photos").insert({
      title: titleInput.trim() || titleFromFileName(selectedFile.name),
      image_url: imageUrl,
      labels: JSON.stringify(labels),
    })

    setIsUploading(false)

    if (insertError) {
      console.error(insertError)
      alert("Photo metadata could not be saved")
      return
    }

    setLabelInput("")
    setSelectedUploadLabels([])
    setSelectedFile(null)
    setTitleInput("")
    await loadPhotos()
    showStatus("Photo uploaded")
  }

  function openEditPanel(photo: PhotoRow) {
    setEditingPhotoId(photo.id)
    setEditTitleInput(photo.title || "")
    setEditLabelInput(parseLabels(photo.labels).join(", "))
    setShowOverlayInfo(true)
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
  }

  function closeEditPanel() {
    setEditingPhotoId(null)
    setEditTitleInput("")
    setEditLabelInput("")
    setIsSavingEdit(false)
  }

  async function savePhotoEdits() {
    if (!activePhoto || !editingPhotoId) return

    setIsSavingEdit(true)

    const cleanedLabels = Array.from(
      new Set(
        editLabelInput
          .split(",")
          .map((label) => label.trim().toLowerCase())
          .filter(Boolean)
      )
    )

    const { error } = await supabase
      .from("photos")
      .update({
        title: editTitleInput.trim() || activePhoto.title,
        labels: JSON.stringify(cleanedLabels),
      })
      .eq("id", editingPhotoId)

    setIsSavingEdit(false)

    if (error) {
      console.error(error)
      alert("Saving failed")
      return
    }

    const rows = await loadPhotos()
    const refreshedPhoto = rows.find((photo) => photo.id === editingPhotoId) ?? null
    if (refreshedPhoto) setActivePhoto(refreshedPhoto)
    closeEditPanel()
    showStatus("Changes saved")
  }

  async function deleteActivePhoto() {
    if (!activePhoto) return

    const confirmed = window.confirm("Delete this photo?")
    if (!confirmed) return

    setIsDeletingPhoto(true)

    const imageUrl = activePhoto.image_url
    const marker = "/storage/v1/object/public/photos/"
    const bucketPath = imageUrl.includes(marker) ? imageUrl.split(marker)[1] : null

    const { error: rowDeleteError } = await supabase.from("photos").delete().eq("id", activePhoto.id)

    if (rowDeleteError) {
      console.error(rowDeleteError)
      setIsDeletingPhoto(false)
      alert("Delete failed")
      return
    }

    if (bucketPath) {
      const { error: storageDeleteError } = await supabase.storage.from("photos").remove([bucketPath])
      if (storageDeleteError) {
        console.error(storageDeleteError)
      }
    }

    setIsDeletingPhoto(false)
    await loadPhotos()
    closeEditPanel()
    setActivePhoto(null)
    showStatus("Photo deleted")
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div
        className={`fixed inset-x-0 top-0 z-30 border-b border-white/10 backdrop-blur-2xl transition-all duration-500 ${headerVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"} ${headerFaded ? "bg-black/35" : "bg-black/50"}`}
      >
        <div className="px-3 py-2 sm:px-4 lg:px-6">
          <div className="hidden items-center gap-6 md:flex">
            <h1 className="shrink-0 text-lg font-medium tracking-[0.24em] text-white">PIET</h1>

            <div className="flex min-w-0 items-center gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Country</span>
              <button
                onClick={() => setSelectedCountry("")}
                className={`shrink-0 text-sm transition ${selectedCountry === "" ? "text-white" : "text-white/45 hover:text-white/80"}`}
              >
                All
              </button>
              {countryOptions.map((label) => (
                <button
                  key={label}
                  onClick={() => setSelectedCountry((current) => (current === label ? "" : label))}
                  className={`shrink-0 text-sm transition ${selectedCountry === label ? "text-white" : "text-white/45 hover:text-white/80"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px shrink-0 bg-white/10" />

            <div className="flex min-w-0 items-center gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Subject</span>
              <button
                onClick={() => setSelectedSubjects([])}
                className={`shrink-0 text-sm transition ${selectedSubjects.length === 0 ? "text-white" : "text-white/45 hover:text-white/80"}`}
              >
                All
              </button>
              {subjectOptions.map((label) => (
                <button
                  key={label}
                  onClick={() => toggleSubject(label)}
                  className={`shrink-0 text-sm transition ${selectedSubjects.includes(label) ? "text-white" : "text-white/45 hover:text-white/80"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={toggleShuffle}
              className={`shrink-0 text-[10px] uppercase tracking-[0.24em] transition ${isShuffled ? "text-white" : "text-white/40 hover:text-white/80"}`}
            >
              Shuffle
            </button>

            {(selectedCountry || selectedSubjects.length > 0) && (
              <button
                onClick={clearFilters}
                className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.24em] text-white/40 transition hover:text-white/80"
              >
                Clear
              </button>
            )}
          </div>

          <div className="md:hidden">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-medium tracking-[0.24em] text-white">PIET</h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleShuffle}
                  className={`text-[10px] uppercase tracking-[0.24em] ${isShuffled ? "text-white" : "text-white/40"}`}
                >
                  Shuffle
                </button>
                {(selectedCountry || selectedSubjects.length > 0) && (
                  <button
                    onClick={clearFilters}
                    className="text-[10px] uppercase tracking-[0.24em] text-white/40"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-baseline gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Country</span>
                <button
                  onClick={() => setSelectedCountry("")}
                  className={`shrink-0 text-sm transition ${selectedCountry === "" ? "text-white" : "text-white/45 hover:text-white/80"}`}
                >
                  All
                </button>
                {countryOptions.map((label) => (
                  <button
                    key={label}
                    onClick={() => setSelectedCountry((current) => (current === label ? "" : label))}
                    className={`shrink-0 text-sm transition ${selectedCountry === label ? "text-white" : "text-white/45 hover:text-white/80"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-baseline gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Subject</span>
                <button
                  onClick={() => setSelectedSubjects([])}
                  className={`shrink-0 text-sm transition ${selectedSubjects.length === 0 ? "text-white" : "text-white/45 hover:text-white/80"}`}
                >
                  All
                </button>
                {subjectOptions.map((label) => (
                  <button
                    key={label}
                    onClick={() => toggleSubject(label)}
                    className={`shrink-0 text-sm transition ${selectedSubjects.includes(label) ? "text-white" : "text-white/45 hover:text-white/80"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur-xl">
          {statusMessage}
        </div>
      )}

      <div className="px-2 pt-20 pb-3 sm:px-3 lg:px-4">
        {isAdminMode && (
          <div className="mb-8 max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">Admin mode</p>
                <p className="mt-1 text-sm text-white/65">Drag a photo into the upload area or choose one manually.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="mb-3 block text-sm text-white/70">1. Choose a photo</label>

                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDraggingFile(true)
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setIsDraggingFile(true)
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    setIsDraggingFile(false)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const file = e.dataTransfer.files?.[0] ?? null
                    selectFile(file)
                  }}
                  className={`relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border transition ${isDraggingFile ? "border-white/60 bg-white/10" : "border-white/10 bg-black/40"}`}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="px-6 text-center">
                      <p className="text-base text-white/80">Drag and drop a photo here</p>
                      <p className="mt-2 text-sm text-white/40">or use the file picker below</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-white"
                  />
                  {selectedFile ? <div className="text-sm text-white/75">{selectedFile.name}</div> : null}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="text-sm text-white/70">2. Add a title</label>
                <input
                  type="text"
                  placeholder="Give this photo a title"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none"
                />

                <label className="text-sm text-white/70">3. Choose existing labels</label>
                {allLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allLabels.map((label) => {
                      const active = selectedUploadLabels.includes(label)
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleUploadLabel(label)}
                          className={
                            active
                              ? "rounded-full bg-white px-4 py-1.5 text-sm text-black"
                              : "rounded-full border border-white/30 px-4 py-1.5 text-sm text-white"
                          }
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-white/45">No labels yet</div>
                )}

                <label className="text-sm text-white/70">4. Add new labels</label>
                <input
                  type="text"
                  placeholder="Add new labels, separated by commas"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none"
                />

                {(selectedUploadLabels.length > 0 || labelInput.trim()) && (
                  <div className="text-sm text-white/65">
                    Existing labels: {selectedUploadLabels.join(", ") || "none"}
                    {labelInput.trim() ? ` | New labels: ${labelInput}` : ""}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={submitUpload}
                    disabled={isUploading || !selectedFile}
                    className="rounded-full bg-white px-5 py-2 text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? "Uploading..." : "Submit photo"}
                  </button>

                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null)
                        setTitleInput("")
                        setLabelInput("")
                        setSelectedUploadLabels([])
                        setIsDraggingFile(false)
                      }}
                      className="rounded-full border border-white/30 px-5 py-2 text-white"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid auto-rows-[8px] grid-cols-2 gap-[8px] sm:gap-[10px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [grid-auto-flow:dense]">
          {filteredPhotos.map((photo, index) => {
            const ratio = photo.width / photo.height

            const isMobileHero = isTouchDevice && (
              index === 0 ||
              (index > 0 && ratio >= 1.2 && index % 7 === 0)
            )

            const isMobileWide = isTouchDevice && !isMobileHero && ratio >= 1.35
            const isMobileTall = isTouchDevice && !isMobileHero && ratio <= 0.82

            const isDesktopWide = !isTouchDevice && ratio >= 1.45
            const isDesktopTall = !isTouchDevice && ratio <= 0.8

            const colSpanClass = isMobileHero
              ? "col-span-2"
              : isDesktopWide
                ? "sm:col-span-2"
                : "col-span-1"

            const rowSpan = isTouchDevice
              ? isMobileHero
                ? 34
                : isMobileTall
                  ? 28
                  : isMobileWide
                    ? 16
                    : 20
              : isDesktopWide
                ? 28
                : isDesktopTall
                  ? 40
                  : 24

            const roundingClass = isMobileHero || isDesktopWide || isDesktopTall || isMobileTall
              ? "rounded-[20px]"
              : "rounded-[14px]"

            return (
              <div
                key={photo.id}
                className={`relative overflow-hidden bg-black transition-all duration-500 ease-out ${roundingClass} ${colSpanClass} ${isShuffleAnimating ? "opacity-45" : "opacity-100"}`}
                style={{
                  gridRow: `span ${rowSpan} / span ${rowSpan}`,
                  transform: isShuffleAnimating
                    ? `translateY(${((index % 5) - 2) * 10}px) scale(0.96)`
                    : "translateY(0px) scale(1)",
                  transitionDelay: isShuffleAnimating ? `${(index % 8) * 18}ms` : "0ms",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActivePhoto(photo)
                    closeEditPanel()
                  }}
                  className="block h-full w-full overflow-hidden bg-black text-left"
                >
                  <div className="h-full w-full bg-black/80 p-[2px] sm:p-[3px]">
                    <div className={`h-full w-full overflow-hidden ${roundingClass}`}>
                      <img
                        src={photo.image_url}
                        alt={photo.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4"
          onMouseMove={revealOverlayInfo}
          onTouchStart={(e) => {
            if (isTouchDevice) {
              touchStartXRef.current = e.touches[0]?.clientX ?? null
            }
          }}
          onTouchEnd={(e) => {
            if (!isTouchDevice || editingPhotoId) return
            const startX = touchStartXRef.current
            const endX = e.changedTouches[0]?.clientX ?? null
            if (startX === null || endX === null) return
            const deltaX = endX - startX
            if (Math.abs(deltaX) > 50) {
              if (deltaX < 0) showNextPhoto()
              if (deltaX > 0) showPreviousPhoto()
            }
            touchStartXRef.current = null
          }}
          onClick={() => {
            closeEditPanel()
            setActivePhoto(null)
          }}
        >
          <div
            className="group relative flex max-h-[95vh] max-w-[92vw] items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              if (isTouchDevice && !editingPhotoId) {
                setShowOverlayInfo((current) => !current)
              }
            }}
          >
            <button
              type="button"
              onClick={() => {
                closeEditPanel()
                setActivePhoto(null)
              }}
              className={`absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-sm text-white backdrop-blur-md transition hover:bg-black/55 ${showOverlayInfo || isTouchDevice || !!editingPhotoId ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              Close
            </button>

            {filteredPhotos.length > 1 && !isTouchDevice && !editingPhotoId && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    showPreviousPhoto()
                  }}
                  className="absolute left-0 top-0 z-20 hidden h-full w-36 items-center justify-start pl-4 text-white/90 group-hover:flex"
                >
                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm backdrop-blur-md">←</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    showNextPhoto()
                  }}
                  className="absolute right-0 top-0 z-20 hidden h-full w-36 items-center justify-end pr-4 text-white/90 group-hover:flex"
                >
                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm backdrop-blur-md">→</span>
                </button>
              </>
            )}

            <img
              src={activePhoto.image_url}
              alt={activePhoto.title}
              className="max-h-[90vh] w-auto max-w-full rounded-[28px] object-contain shadow-2xl"
            />

            <div
              className={`absolute inset-x-0 bottom-0 p-3 transition duration-300 sm:p-6 ${showOverlayInfo || !!editingPhotoId ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            >
              <div
                className="mx-auto max-w-md rounded-[16px] border border-white/10 bg-black/30 p-2.5 shadow-2xl backdrop-blur-xl"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => {
                  setShowOverlayInfo(true)
                  if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current)
                }}
                onMouseLeave={hideOverlayInfoSoon}
                onTouchStart={(e) => {
                  e.stopPropagation()
                }}
              >
                {isAdminMode && editingPhotoId === activePhoto.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm text-white/65">Title</label>
                      <input
                        type="text"
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-white/65">Labels</label>
                      <input
                        type="text"
                        value={editLabelInput}
                        onChange={(e) => setEditLabelInput(e.target.value)}
                        placeholder="separate labels with commas"
                        className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-white/65">Add existing labels</label>
                      <div className="flex flex-wrap gap-2">
                        {allLabels
                          .filter((label) => {
                            const currentEditLabels = Array.from(
                              new Set(
                                editLabelInput
                                  .split(",")
                                  .map((item) => item.trim().toLowerCase())
                                  .filter(Boolean)
                              )
                            )
                            return !currentEditLabels.includes(label)
                          })
                          .map((label) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => {
                                const current = editLabelInput
                                  .split(",")
                                  .map((item) => item.trim().toLowerCase())
                                  .filter(Boolean)
                                const next = Array.from(new Set([...current, label]))
                                setEditLabelInput(next.join(", "))
                              }}
                              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white transition hover:bg-white hover:text-black"
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editLabelInput
                        .split(",")
                        .map((label) => label.trim().toLowerCase())
                        .filter(Boolean)
                        .map((label) => (
                          <span
                            key={label}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white"
                          >
                            {label}
                          </span>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={savePhotoEdits}
                        disabled={isSavingEdit}
                        className="rounded-full bg-white px-4 py-2 text-sm text-black disabled:opacity-50"
                      >
                        {isSavingEdit ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={closeEditPanel}
                        className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={deleteActivePhoto}
                        disabled={isDeletingPhoto}
                        className="rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 disabled:opacity-50"
                      >
                        {isDeletingPhoto ? "Deleting..." : "Delete photo"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium text-white sm:text-base">{activePhoto.title}</h2>

                      {isAdminMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditPanel(activePhoto)
                          }}
                          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:bg-white hover:text-black"
                        >
                          Edit photo
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseLabels(activePhoto.labels).map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (COUNTRY_LABELS.includes(label as (typeof COUNTRY_LABELS)[number])) {
                              setSelectedCountry(label)
                              setSelectedSubjects([])
                            } else {
                              setSelectedCountry("")
                              setSelectedSubjects([label])
                            }
                            closeEditPanel()
                            setActivePhoto(null)
                          }}
                          className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] text-white backdrop-blur-md transition hover:bg-white hover:text-black"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
