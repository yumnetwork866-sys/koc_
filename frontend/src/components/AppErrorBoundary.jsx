import React from 'react';

const CHUNK_ERROR_PATTERN = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = CHUNK_ERROR_PATTERN.test(String(error?.message || error));

    return (
      <div className="app-shell">
        <main className="page">
          <section className="section-card empty-state" role="alert">
            <h1>Không thể hiển thị giao diện</h1>
            <p>
              {isChunkError
                ? 'Phiên bản giao diện vừa được cập nhật. Hãy tải lại ứng dụng để dùng phiên bản mới nhất.'
                : 'Ứng dụng gặp lỗi khi hiển thị. Phiên đăng nhập của bạn vẫn được giữ an toàn.'}
            </p>
            <button className="button" type="button" onClick={this.handleReload}>
              Tải lại ứng dụng
            </button>
          </section>
        </main>
      </div>
    );
  }
}

export default AppErrorBoundary;
