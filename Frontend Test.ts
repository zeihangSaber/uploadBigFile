/**
 * 实现一个大文件上传方法
 *
 * 支持功能以下功能：
 *  - 支持分片上传
 *  - 支持控制分片最大并发数
 *
 * 尽可能的符合以下要求：
 *  - 支持上传进度回调
 *  - 支持断点续传
 *  - 支持上传失败重试
 */

/**
 * 此方法无需实现
 * 用来判断是否是取消的错误的伪代码
 * 例如
 * try {
 *     const { uploadPromise } = uploadChunk({chunk})
 *     await uploadPromise;
 * } catch(e) {
 *     // 是手动取消，无需处理这个reject
 *     if (isCancelError(e)) {
 *     }
 * }
 */
const isCancelError: (error: any) => boolean = (() => {}) as any

/**
 * 此方法无需实现
 * 单片上传按照这个方法写伪代码
 */
const uploadChunk: (payload: {
  chunk: any

  /**
   * 单片的进度回调
   */
  onProgress: (progress: number) => void
}) => {
  /**
   * 返回单片的promise
   * 上传成功resolve
   * 上传失败reject
   */
  uploadPromise: Promise<any>
  /**
   * 调用此方法会取消上传, uploadPromise会reject
   */
  cancel: () => void
} = (() => {}) as any

interface UploadBigFile {
  (payload: {
    /**
     * 模拟文件，一个单位为一个chunk
     */
    file: any[]
    /**
     * 最大并发数
     */
    maxConcurrent: number
    /**
     * 总的上传回调
     */
    onProgress: (progress: number) => void
    /**
     * 任意一片上传失败即为失败
     */
    onFail: (error: Error) => void
    /**
     * 上传成功
     */
    onSucceed: () => void
    /**
     * 单片上传失败重试次数
     */
    retryTimes?: number
  }): {
    start: () => void
    stop: () => void
    continue: () => void
    cancel: () => void
  }
}

/**
 *
 * const instance = uploadBigFile({})
 *
 * instance.start() // 开始上传
 * instance.stop() // 暂停上传
 * instance.continue() // 继续上传
 * instance.cancel() // 取消上传
 */
const uploadBigFile: UploadBigFile = (payload) => {
  const { file, maxConcurrent, onProgress, onFail, onSucceed, retryTimes = 3 } = payload

  let uploadedChunks = 0
  let totalChunks = file.length
  let activeUploads = 0
  let isPaused = false
  let isCanceled = false
  let currentIndex = 0

  const chunkStatus: Array<{
    completed: boolean
    retries: number
    cancel?: () => void
  }> = Array(totalChunks).fill({ completed: false, retries: 0 })

  const updateProgress = () => {
    const progress = (uploadedChunks / totalChunks) * 100
    onProgress(progress)
  }

  const uploadNextChunk = async () => {
    if (isPaused || isCanceled || currentIndex >= totalChunks) return

    // 找到下一个未完成的chunk
    while (currentIndex < totalChunks && (chunkStatus[currentIndex].completed || activeUploads >= maxConcurrent)) {
      currentIndex++
    }

    if (currentIndex >= totalChunks) {
      if (activeUploads === 0 && uploadedChunks === totalChunks) {
        onSucceed()
      }
      return
    }

    const chunkIndex = currentIndex++
    activeUploads++

    try {
      const { uploadPromise, cancel } = uploadChunk({
        chunk: file[chunkIndex],
        onProgress: () => {}, // 单片进度暂不处理
      })

      chunkStatus[chunkIndex] = {
        ...chunkStatus[chunkIndex],
        cancel,
      }

      await uploadPromise

      uploadedChunks++
      chunkStatus[chunkIndex] = {
        ...chunkStatus[chunkIndex],
        completed: true,
      }

      updateProgress()
    } catch (error) {
      if (!isCancelError(error)) {
        const currentRetries = chunkStatus[chunkIndex].retries || 0
        if (currentRetries < retryTimes) {
          chunkStatus[chunkIndex] = {
            ...chunkStatus[chunkIndex],
            retries: currentRetries + 1,
          }
          currentIndex = chunkIndex // 重试当前chunk
        } else {
          onFail(error as Error)
          return
        }
      }
    } finally {
      activeUploads--
      uploadNextChunk() // 继续上传下一个
    }

    // 并行上传
    if (activeUploads < maxConcurrent) {
      uploadNextChunk()
    }
  }

  return {
    start: () => {
      isPaused = false
      isCanceled = false
      for (let i = 0; i < Math.min(maxConcurrent, totalChunks); i++) {
        uploadNextChunk()
      }
    },
    stop: () => {
      isPaused = true
    },
    continue: () => {
      isPaused = false
      uploadNextChunk()
    },
    cancel: () => {
      isCanceled = true
      chunkStatus.forEach((chunk) => {
        if (chunk.cancel) chunk.cancel()
      })
    },
  }
}
