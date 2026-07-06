"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { isCountryLabel } from "@/lib/countries"

type PhotoRow = {
  id: string
  title: string
  image_url: string
  labels: string | null
  created_at: string
}

type PhotoWithMeta = PhotoRow & {
  width: number
  height: number
}

function parseLabels(labels: PhotoRow["labels"]): string[] {
  if (Array.isArray(labels)) {
    return labels.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
  }
  if (typeof labels === "string" && labels.trim()) {
    try {
      const parsed = JSON.parse(labels)
      if (Array.isArray(parsed)) return parsed.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
      return [labels.trim().toLowerCase()]
    } catch {
      return labels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
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

// Grid images only need to be ~1 cell wide. This tells next/image which size
// to actually download (it serves 2x for retina automatically, so it stays sharp).
const GRID_SIZES =
  "(min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"

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
  const [isReplacing, setIsReplacing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [headerFaded, setHeaderFaded] = useState(false)
  const [isShuffled, setIsShuffled] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [isShuffleAnimating, setIsShuffleAnimating] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [subscribeEmail, setSubscribeEmail] = useState("")
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const swipedRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  const previewUrl = useMemo(() => {
    if (!selectedFile) return ""
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  useEffect(() => { void loadPhotos() }, [])

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none), (pointer: coarse)").matches)
    const params = new URLSearchParams(window.location.search)
    setIsAdminMode(params.get("admin") === "true")
  }, [])

  // Show the newsletter popup once per visitor (a few seconds after landing).
  useEffect(() => {
    if (typeof window === "undefined") return
    let seen = false
    try { seen = localStorage.getItem("piet-newsletter-seen") === "1" } catch { seen = false }
    if (seen) return
    const t = setTimeout(() => {
      setShowSubscribe(true)
      try { localStorage.setItem("piet-newsletter-seen", "1") } catch {}
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  // Lock background scroll whenever a full-screen layer is open (fixes the
  // "page scrolls while I try to swipe" problem on mobile).
  useEffect(() => {
    const anyLayerOpen = !!activePhoto || showContact || showSubscribe
    document.body.style.overflow = anyLayerOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [activePhoto, showContact, showSubscribe])

  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY
      const diff = currentY - lastScrollYRef.current
      if (currentY < 40) { setHeaderVisible(true); setHeaderFaded(false) }
      else if (diff > 8) { setHeaderVisible(false); setHeaderFaded(true) }
      else if (diff < -8) { setHeaderVisible(true); setHeaderFaded(currentY > 120) }
      lastScrollYRef.current = currentY
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (!activePhoto) return
    if (isTouchDevice) { setShowOverlayInfo(true) }
    else { setShowOverlayInfo(!!editingPhotoId) }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (editingPhotoId) { closeEditPanel(); return }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhoto, isTouchDevice, editingPhotoId])

  useEffect(() => {
    return () => { if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current) }
  }, [])

  useEffect(() => {
    if (!isShuffleAnimating) return
    const timeout = setTimeout(() => setIsShuffleAnimating(false), 520)
    return () => clearTimeout(timeout)
  }, [isShuffleAnimating])

  const allLabels = useMemo(() => {
    const values = photos.flatMap((p) => parseLabels(p.labels))
    return Array.from(new Set(values)).sort()
  }, [photos])

  const countryOptions = useMemo(
    () => allLabels.filter((l) => isCountryLabel(l)),
    [allLabels]
  )

  const subjectOptions = useMemo(
    () => allLabels.filter((l) => !isCountryLabel(l)),
    [allLabels]
  )

  const orderedPhotos = useMemo(() => {
    if (!isShuffled) return photos
    const keyed = photos.map((p) => ({ ...p, _key: `${p.id}-${shuffleSeed}` }))
    return shuffleArray(keyed).map(({ _key, ...p }) => p)
  }, [photos, isShuffled, shuffleSeed])

  const filteredPhotos = orderedPhotos.filter((photo) => {
    const photoLabels = parseLabels(photo.labels)
    const matchesCountry = !selectedCountry || photoLabels.includes(selectedCountry)
    const matchesSubjects = selectedSubjects.every((l) => photoLabels.includes(l))
    return matchesCountry && matchesSubjects
  })

  function showStatus(message: string) {
    setStatusMessage(message)
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(""), 2200)
  }

  async function loadPhotos() {
    try {
      const res = await fetch("/api/photos")
      const rows: PhotoRow[] = await res.json()
      const withMeta: PhotoWithMeta[] = rows.map((photo, index) => ({
        ...photo,
        width: index % 5 === 0 ? 1600 : index % 3 === 0 ? 900 : 1200,
        height: index % 4 === 0 ? 1600 : 900,
      }))
      setPhotos(withMeta)
      return withMeta
    } catch {
      showStatus("Could not load photos")
      return []
    }
  }

  function toggleUploadLabel(label: string) {
    setSelectedUploadLabels((cur) => cur.includes(label) ? cur.filter((i) => i !== label) : [...cur, label])
  }

  function toggleSubject(label: string) {
    setSelectedSubjects((cur) => cur.includes(label) ? cur.filter((i) => i !== label) : [...cur, label])
  }

  function clearFilters() {
    setSelectedCountry("")
    setSelectedSubjects([])
  }

  function toggleShuffle() {
    setIsShuffleAnimating(true)
    window.setTimeout(() => { setShuffleSeed(Date.now()); setIsShuffled((cur) => !cur) }, 110)
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
    return filteredPhotos.findIndex((p) => p.id === activePhoto.id)
  }

  function showNextPhoto() {
    if (!activePhoto || filteredPhotos.length < 2) return
    const i = currentPhotoIndex()
    if (i === -1) return
    setActivePhoto(filteredPhotos[(i + 1) % filteredPhotos.length])
    closeEditPanel()
  }

  function showPreviousPhoto() {
    if (!activePhoto || filteredPhotos.length < 2) return
    const i = currentPhotoIndex()
    if (i === -1) return
    setActivePhoto(filteredPhotos[(i - 1 + filteredPhotos.length) % filteredPhotos.length])
    closeEditPanel()
  }

  function selectFile(file: File | null) {
    if (!file) return
    setSelectedFile(file)
    setTitleInput((cur) => cur || titleFromFileName(file.name))
    setIsDraggingFile(false)
  }

  async function submitUpload() {
    if (!selectedFile) { alert("Please choose a photo first"); return }
    setIsUploading(true)
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: selectedFile.name, contentType: selectedFile.type }),
      })
      const { signedUrl, publicUrl } = await res.json()

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      })
      if (!uploadRes.ok) {
        const text = await uploadRes.text()
        alert("R2 upload failed: " + uploadRes.status + " " + text)
        setIsUploading(false)
        return
      }

      const typedLabels = labelInput.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
      const labels = JSON.stringify(Array.from(new Set([...selectedUploadLabels, ...typedLabels])))

      await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput.trim() || titleFromFileName(selectedFile.name),
          image_url: publicUrl,
          labels,
        }),
      })

      setLabelInput("")
      setSelectedUploadLabels([])
      setSelectedFile(null)
      setTitleInput("")
      await loadPhotos()
      showStatus("Photo uploaded")
    } catch {
      alert("Upload failed, please try again")
    } finally {
      setIsUploading(false)
    }
  }

  async function replaceActivePhoto(file: File | null) {
    if (!file || !activePhoto) return
    setIsReplacing(true)
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      })
      const { signedUrl, publicUrl } = await res.json()

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!uploadRes.ok) {
        alert("Upload failed: " + uploadRes.status)
        setIsReplacing(false)
        return
      }

      await fetch(`/api/photos/${activePhoto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: publicUrl }),
      })

      const rows = await loadPhotos()
      const refreshed = rows.find((p) => p.id === activePhoto.id) ?? null
      if (refreshed) setActivePhoto(refreshed)
      showStatus("Photo replaced")
    } catch {
      alert("Replace failed, please try again")
    } finally {
      setIsReplacing(false)
      if (replaceInputRef.current) replaceInputRef.current.value = ""
    }
  }

  async function submitContact() {
    if (!contactMessage.trim()) { alert("Please write a message"); return }
    setIsSending(true)
    try {
      const response = await fetch("https://formspree.io/f/mgonzopr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: contactName.trim(), email: contactEmail.trim(), message: contactMessage.trim() }),
      })
      if (!response.ok) { alert("Message could not be sent"); return }
      setContactName(""); setContactEmail(""); setContactMessage("")
      setShowContact(false)
      showStatus("Message sent")
    } catch {
      alert("Message could not be sent")
    } finally {
      setIsSending(false)
    }
  }

  async function submitSubscribe() {
    const email = subscribeEmail.trim()
    if (!email.includes("@") || !email.includes(".")) { setSubscribeStatus("error"); return }
    setSubscribeStatus("loading")
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setSubscribeStatus(res.ok ? "success" : "error")
    } catch {
      setSubscribeStatus("error")
    }
  }

  function openSubscribe() {
    setSubscribeStatus("idle")
    setShowSubscribe(true)
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
    try {
      const cleanedLabels = JSON.stringify(Array.from(new Set(
        editLabelInput.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
      )))
      await fetch(`/api/photos/${editingPhotoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitleInput.trim() || activePhoto.title, labels: cleanedLabels }),
      })
      const rows = await loadPhotos()
      const refreshed = rows.find((p) => p.id === editingPhotoId) ?? null
      if (refreshed) setActivePhoto(refreshed)
      closeEditPanel()
      showStatus("Changes saved")
    } catch {
      alert("Could not save changes")
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function deleteActivePhoto() {
    if (!activePhoto) return
    const confirmed = window.confirm("Delete this photo?")
    if (!confirmed) return
    setIsDeletingPhoto(true)
    try {
      await fetch(`/api/photos/${activePhoto.id}`, { method: "DELETE" })
      await loadPhotos()
      closeEditPanel()
      setActivePhoto(null)
      showStatus("Photo deleted")
    } catch {
      alert("Could not delete photo")
    } finally {
      setIsDeletingPhoto(false)
    }
  }

  // One place to decide, on touch, whether a gesture was a swipe or a tap.
  function handleOverlayTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
    touchStartYRef.current = e.touches[0]?.clientY ?? null
    swipedRef.current = false
  }

  function handleOverlayTouchEnd(e: React.TouchEvent) {
    if (editingPhotoId) return
    const startX = touchStartXRef.current
    const startY = touchStartYRef.current
    const endX = e.changedTouches[0]?.clientX ?? null
    const endY = e.changedTouches[0]?.clientY ?? null
    touchStartXRef.current = null
    touchStartYRef.current = null
    if (startX === null || endX === null || startY === null || endY === null) return
    const dx = endX - startX
    const dy = endY - startY
    // Horizontal swipe: navigate. Must be clearly sideways, not a scroll.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipedRef.current = true
      if (dx < 0) showNextPhoto()
      else showPreviousPhoto()
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className={`fixed inset-x-0 top-0 z-30 border-b border-white/10 backdrop-blur-2xl transition-all duration-500 ${headerVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"} ${headerFaded ? "bg-black/35" : "bg-black/50"}`}>
        <div className="px-3 py-2 sm:px-4 lg:px-6">
          <div className="hidden items-center gap-6 md:flex">
            <h1 className="shrink-0 text-lg font-medium tracking-[0.24em] text-white">PIET</h1>
            <div className="flex min-w-0 items-center gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Country</span>
              <button onClick={() => setSelectedCountry("")} className={`shrink-0 text-sm transition ${selectedCountry === "" ? "text-white" : "text-white/45 hover:text-white/80"}`}>All</button>
              {countryOptions.map((label) => (
                <button key={label} onClick={() => setSelectedCountry((cur) => cur === label ? "" : label)} className={`shrink-0 text-sm capitalize transition ${selectedCountry === label ? "text-white" : "text-white/45 hover:text-white/80"}`}>{label}</button>
              ))}
            </div>
            <div className="h-4 w-px shrink-0 bg-white/10" />
            <div className="flex min-w-0 items-center gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Subject</span>
              <button onClick={() => setSelectedSubjects([])} className={`shrink-0 text-sm transition ${selectedSubjects.length === 0 ? "text-white" : "text-white/45 hover:text-white/80"}`}>All</button>
              {subjectOptions.map((label) => (
                <button key={label} onClick={() => toggleSubject(label)} className={`shrink-0 text-sm capitalize transition ${selectedSubjects.includes(label) ? "text-white" : "text-white/45 hover:text-white/80"}`}>{label}</button>
              ))}
            </div>
            <button onClick={toggleShuffle} className={`shrink-0 text-[10px] uppercase tracking-[0.24em] transition ${isShuffled ? "text-white" : "text-white/40 hover:text-white/80"}`}>Shuffle</button>
            <button onClick={openSubscribe} className="shrink-0 text-[10px] uppercase tracking-[0.24em] text-white/40 transition hover:text-white/80">Subscribe</button>
            <button onClick={() => setShowContact(true)} className="shrink-0 text-[10px] uppercase tracking-[0.24em] text-white/40 transition hover:text-white/80">Contact</button>
            {(selectedCountry || selectedSubjects.length > 0) && (
              <button onClick={clearFilters} className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.24em] text-white/40 transition hover:text-white/80">Clear</button>
            )}
          </div>

          <div className="md:hidden">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-medium tracking-[0.24em] text-white">PIET</h1>
              <div className="flex items-center gap-3">
                <button onClick={toggleShuffle} className={`text-[10px] uppercase tracking-[0.24em] ${isShuffled ? "text-white" : "text-white/40"}`}>Shuffle</button>
                <button onClick={openSubscribe} className="text-[10px] uppercase tracking-[0.24em] text-white/40">Subscribe</button>
                <button onClick={() => setShowContact(true)} className="text-[10px] uppercase tracking-[0.24em] text-white/40">Contact</button>
                {(selectedCountry || selectedSubjects.length > 0) && (
                  <button onClick={clearFilters} className="text-[10px] uppercase tracking-[0.24em] text-white/40">Clear</button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-baseline gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Country</span>
                <button onClick={() => setSelectedCountry("")} className={`shrink-0 text-sm transition ${selectedCountry === "" ? "text-white" : "text-white/45 hover:text-white/80"}`}>All</button>
                {countryOptions.map((label) => (
                  <button key={label} onClick={() => setSelectedCountry((cur) => cur === label ? "" : label)} className={`shrink-0 text-sm capitalize transition ${selectedCountry === label ? "text-white" : "text-white/45 hover:text-white/80"}`}>{label}</button>
                ))}
              </div>
              <div className="flex items-baseline gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-white/30">Subject</span>
                <button onClick={() => setSelectedSubjects([])} className={`shrink-0 text-sm transition ${selectedSubjects.length === 0 ? "text-white" : "text-white/45 hover:text-white/80"}`}>All</button>
                {subjectOptions.map((label) => (
                  <button key={label} onClick={() => toggleSubject(label)} className={`shrink-0 text-sm capitalize transition ${selectedSubjects.includes(label) ? "text-white" : "text-white/45 hover:text-white/80"}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur-xl">{statusMessage}</div>
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
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
                  onDragEnter={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false) }}
                  onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0] ?? null) }}
                  className={`relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border transition ${isDraggingFile ? "border-white/60 bg-white/10" : "border-white/10 bg-black/40"}`}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="px-6 text-center">
                      <p className="text-base text-white/80">Drag and drop a photo here</p>
                      <p className="mt-2 text-sm text-white/40">or use the file picker below</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <input type="file" accept="image/*" onChange={(e) => selectFile(e.target.files?.[0] ?? null)} className="text-sm text-white" />
                  {selectedFile ? <div className="text-sm text-white/75">{selectedFile.name}</div> : null}
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="text-sm text-white/70">2. Add a title</label>
                <input type="text" placeholder="Give this photo a title" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none" />
                <label className="text-sm text-white/70">3. Choose existing labels</label>
                {allLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allLabels.map((label) => (
                      <button key={label} type="button" onClick={() => toggleUploadLabel(label)} className={selectedUploadLabels.includes(label) ? "rounded-full bg-white px-4 py-1.5 text-sm capitalize text-black" : "rounded-full border border-white/30 px-4 py-1.5 text-sm capitalize text-white"}>{label}</button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/45">No labels yet</div>
                )}
                <label className="text-sm text-white/70">4. Add new labels</label>
                <input type="text" placeholder="Add new labels, separated by commas" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} className="rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none" />
                {(selectedUploadLabels.length > 0 || labelInput.trim()) && (
                  <div className="text-sm text-white/65">
                    Existing labels: {selectedUploadLabels.join(", ") || "none"}
                    {labelInput.trim() ? ` | New labels: ${labelInput}` : ""}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={submitUpload} disabled={isUploading || !selectedFile} className="rounded-full bg-white px-5 py-2 text-black disabled:cursor-not-allowed disabled:opacity-50">
                    {isUploading ? "Uploading..." : "Submit photo"}
                  </button>
                  {selectedFile && (
                    <button type="button" onClick={() => { setSelectedFile(null); setTitleInput(""); setLabelInput(""); setSelectedUploadLabels([]); setIsDraggingFile(false) }} className="rounded-full border border-white/30 px-5 py-2 text-white">Reset</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid auto-rows-[8px] grid-cols-2 gap-[8px] sm:gap-[10px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [grid-auto-flow:dense]">
          {filteredPhotos.map((photo, index) => {
            const ratio = photo.width / photo.height
            const isMobileHero = isTouchDevice && (index === 0 || (index > 0 && ratio >= 1.2 && index % 7 === 0))
            const isMobileWide = isTouchDevice && !isMobileHero && ratio >= 1.35
            const isMobileTall = isTouchDevice && !isMobileHero && ratio <= 0.82
            const isDesktopWide = !isTouchDevice && ratio >= 1.45
            const isDesktopTall = !isTouchDevice && ratio <= 0.8
            const colSpanClass = isMobileHero ? "col-span-2" : isDesktopWide ? "sm:col-span-2" : "col-span-1"
            const rowSpan = isTouchDevice ? (isMobileHero ? 34 : isMobileTall ? 28 : isMobileWide ? 16 : 20) : (isDesktopWide ? 28 : isDesktopTall ? 40 : 24)
            const roundingClass = isMobileHero || isDesktopWide || isDesktopTall || isMobileTall ? "rounded-[20px]" : "rounded-[14px]"
            return (
              <div key={photo.id} className={`relative overflow-hidden bg-black transition-all duration-500 ease-out ${roundingClass} ${colSpanClass} ${isShuffleAnimating ? "opacity-45" : "opacity-100"}`}
                style={{ gridRow: `span ${rowSpan} / span ${rowSpan}`, transform: isShuffleAnimating ? `translateY(${((index % 5) - 2) * 10}px) scale(0.96)` : "translateY(0px) scale(1)", transitionDelay: isShuffleAnimating ? `${(index % 8) * 18}ms` : "0ms" }}>
                <button type="button" onClick={() => { setActivePhoto(photo); closeEditPanel() }} className="block h-full w-full overflow-hidden bg-black text-left">
                  <div className="h-full w-full bg-black/80 p-[2px] sm:p-[3px]">
                    <div className={`relative h-full w-full overflow-hidden ${roundingClass}`}>
                      <Image
                        src={photo.image_url}
                        alt={photo.title}
                        fill
                        sizes={GRID_SIZES}
                        className="object-cover"
                        priority={index < 4}
                        loading={index < 4 ? undefined : "lazy"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4"
          onMouseMove={revealOverlayInfo}
          onClick={() => { closeEditPanel(); setActivePhoto(null) }}>
          <div className="group relative inline-flex max-h-[95vh] max-w-[92vw] items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              // A finished swipe should not also count as a tap-toggle.
              if (swipedRef.current) { swipedRef.current = false; return }
              if (isTouchDevice && !editingPhotoId) setShowOverlayInfo((cur) => !cur)
            }}
            onTouchStart={(e) => { if (isTouchDevice) handleOverlayTouchStart(e) }}
            onTouchEnd={(e) => { if (isTouchDevice) handleOverlayTouchEnd(e) }}
          >
            <button type="button" onClick={(e) => { e.stopPropagation(); closeEditPanel(); setActivePhoto(null) }}
              className={`absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-sm text-white backdrop-blur-md transition hover:bg-black/55 ${showOverlayInfo || isTouchDevice || !!editingPhotoId ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              Close
            </button>
            {filteredPhotos.length > 1 && !isTouchDevice && !editingPhotoId && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); showPreviousPhoto() }} className="absolute left-0 top-0 z-20 hidden h-full w-36 items-center justify-start pl-4 text-white/90 group-hover:flex">
                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm backdrop-blur-md">&larr;</span>
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); showNextPhoto() }} className="absolute right-0 top-0 z-20 hidden h-full w-36 items-center justify-end pr-4 text-white/90 group-hover:flex">
                  <span className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm backdrop-blur-md">&rarr;</span>
                </button>
              </>
            )}
            {/* Full-resolution original here — quality is untouched for the opened photo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activePhoto.image_url} alt={activePhoto.title} className="max-h-[90vh] w-auto max-w-full select-none rounded-[28px] object-contain shadow-2xl" draggable={false} />
            <div className={`absolute inset-x-0 bottom-0 p-3 transition duration-300 sm:p-6 ${showOverlayInfo || !!editingPhotoId ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
              <div className="mx-auto max-w-md rounded-[16px] border border-white/10 bg-black/30 p-2.5 shadow-2xl backdrop-blur-xl"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => { setShowOverlayInfo(true); if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current) }}
                onMouseLeave={hideOverlayInfoSoon}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}>
                {isAdminMode && editingPhotoId === activePhoto.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm text-white/65">Title</label>
                      <input type="text" value={editTitleInput} onChange={(e) => setEditTitleInput(e.target.value)} className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white outline-none" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-white/65">Labels</label>
                      <input type="text" value={editLabelInput} onChange={(e) => setEditLabelInput(e.target.value)} placeholder="separate labels with commas" className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white outline-none" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-white/65">Add existing labels</label>
                      <div className="flex flex-wrap gap-2">
                        {allLabels.filter((label) => {
                          const current = Array.from(new Set(editLabelInput.split(",").map((i) => i.trim().toLowerCase()).filter(Boolean)))
                          return !current.includes(label)
                        }).map((label) => (
                          <button key={label} type="button"
                            onClick={() => {
                              const current = editLabelInput.split(",").map((i) => i.trim().toLowerCase()).filter(Boolean)
                              setEditLabelInput(Array.from(new Set([...current, label])).join(", "))
                            }}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm capitalize text-white transition hover:bg-white hover:text-black">
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editLabelInput.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean).map((label) => (
                        <span key={label} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm capitalize text-white">{label}</span>
                      ))}
                    </div>
                    <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => replaceActivePhoto(e.target.files?.[0] ?? null)} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={savePhotoEdits} disabled={isSavingEdit} className="rounded-full bg-white px-4 py-2 text-sm text-black disabled:opacity-50">{isSavingEdit ? "Saving..." : "Save changes"}</button>
                      <button type="button" onClick={() => replaceInputRef.current?.click()} disabled={isReplacing} className="rounded-full border border-white/30 bg-white/5 px-4 py-2 text-sm text-white disabled:opacity-50">{isReplacing ? "Replacing..." : "Replace photo"}</button>
                      <button type="button" onClick={closeEditPanel} className="rounded-full border border-white/20 px-4 py-2 text-sm text-white">Cancel</button>
                      <button type="button" onClick={deleteActivePhoto} disabled={isDeletingPhoto} className="rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 disabled:opacity-50">{isDeletingPhoto ? "Deleting..." : "Delete photo"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium text-white sm:text-base">{activePhoto.title}</h2>
                      {isAdminMode && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEditPanel(activePhoto) }} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:bg-white hover:text-black">Edit photo</button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseLabels(activePhoto.labels).map((label) => (
                        <button key={label} type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCountryLabel(label)) { setSelectedCountry(label); setSelectedSubjects([]) }
                            else { setSelectedCountry(""); setSelectedSubjects([label]) }
                            closeEditPanel(); setActivePhoto(null)
                          }}
                          className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] capitalize text-white backdrop-blur-md transition hover:bg-white hover:text-black">
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

      {showContact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setShowContact(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-white">Contact</h2>
              <button type="button" onClick={() => setShowContact(false)} className="text-sm text-white/50 hover:text-white/80">Close</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="Name (optional)" value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none" />
              <input type="email" placeholder="Email (optional)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none" />
              <textarea placeholder="Your message" value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} className="h-32 w-full rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none" />
              <div className="flex items-center justify-between gap-3 pt-1">
                <button type="button" onClick={() => setShowContact(false)} className="text-sm text-white/50 hover:text-white/80">Cancel</button>
                <button type="button" onClick={submitContact} disabled={isSending} className="rounded-full bg-white px-5 py-2 text-black disabled:opacity-50">{isSending ? "Sending..." : "Send"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubscribe && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/85 p-4" onClick={() => setShowSubscribe(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-white">Monthly photo digest</h2>
                <p className="mt-1 text-sm text-white/55">Once a month, a short email with the new photos I've added. No spam.</p>
              </div>
              <button type="button" onClick={() => setShowSubscribe(false)} className="text-sm text-white/50 hover:text-white/80">Close</button>
            </div>
            {subscribeStatus === "success" ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/80">
                You&apos;re subscribed. See you in your inbox.
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={subscribeEmail}
                  onChange={(e) => { setSubscribeEmail(e.target.value); if (subscribeStatus === "error") setSubscribeStatus("idle") }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSubscribe() }}
                  className="w-full rounded-xl border border-white/20 bg-black px-3 py-2 text-white outline-none"
                />
                {subscribeStatus === "error" && (
                  <p className="text-sm text-red-300">Please enter a valid email and try again.</p>
                )}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button type="button" onClick={() => setShowSubscribe(false)} className="text-sm text-white/50 hover:text-white/80">Maybe later</button>
                  <button type="button" onClick={submitSubscribe} disabled={subscribeStatus === "loading"} className="rounded-full bg-white px-5 py-2 text-black disabled:opacity-50">
                    {subscribeStatus === "loading" ? "Subscribing..." : "Subscribe"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
