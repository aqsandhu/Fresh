/** Canvas helpers — mirror customer-app DoorPhotoCropModal (center square or full JPEG). */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode image'))
          return
        }
        const safeName = fileName.replace(/\.\w+$/i, '') || 'door'
        resolve(new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      quality
    )
  })
}

/** Compress to JPEG without cropping. */
export async function compressDoorPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0)
    return canvasToFile(canvas, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Center square crop — same rule as the mobile app. */
export async function cropCenterSquareDoorPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    const size = Math.min(width, height)
    if (size < 1) return compressDoorPhoto(file)

    const originX = Math.max(0, Math.floor((width - size) / 2))
    const originY = Math.max(0, Math.floor((height - size) / 2))

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, originX, originY, size, size, 0, 0, size, size)
    return canvasToFile(canvas, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function processDoorPhoto(file: File, doCrop: boolean): Promise<File> {
  return doCrop ? cropCenterSquareDoorPhoto(file) : compressDoorPhoto(file)
}
