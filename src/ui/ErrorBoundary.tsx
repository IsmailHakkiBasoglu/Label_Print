import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; onReset: () => void };

/** Keeps a project that cannot be drawn from blanking the whole app on every load. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="error banner">
        <p>Bu proje çizilemedi.</p>
        <button
          onClick={() => {
            this.props.onReset();
            this.setState({ failed: false });
          }}
        >
          Boş projeyle devam et
        </button>
      </div>
    );
  }
}
