import { Component } from 'react'

// 兜底：任何页面崩了都不再是白屏，至少能看到原因，方便排查。
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[App] 页面崩溃:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center bg-cream">
        <p className="text-[15px] text-[#4b4232]">页面出了点问题</p>
        <p className="text-[11px] leading-relaxed text-[#8b7f68] break-all max-w-xs">
          {String(error?.message || error)}
        </p>
        <button
          className="mt-1 rounded-full bg-[#6f8462] px-5 py-2 text-[13px] text-white active:scale-95 transition"
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
        >
          重新加载
        </button>
      </div>
    )
  }
}
