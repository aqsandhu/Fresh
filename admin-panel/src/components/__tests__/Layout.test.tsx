import { fireEvent, render, screen } from '@testing-library/react';
import { Layout, LayoutNestedContext } from '@/components/layout/Layout';

// Isolate Layout from its heavy children — this suite's job is to (a) ensure the
// module loads at all (it defines LayoutNestedContext via React.createContext at
// module-eval time, which silently crashed the whole suite when esModuleInterop
// was off) and (b) verify the nested-vs-chrome branch.
jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="sidebar">sidebar-{isOpen ? 'open' : 'closed'}</div>
  ),
}));
jest.mock('@/components/layout/Header', () => ({
  Header: ({ title }: { title: string }) => <div data-testid="header">{title}</div>,
}));

describe('Layout', () => {
  it('module loads and exposes LayoutNestedContext (guards the createContext crash)', () => {
    expect(LayoutNestedContext).toBeDefined();
  });

  it('renders the chrome (sidebar + header) and content at the top level', () => {
    render(
      <Layout title="Orders">
        <p>page body</p>
      </Layout>
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toHaveTextContent('Orders');
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('renders content-only (no chrome) when nested inside another Layout', () => {
    render(
      <LayoutNestedContext.Provider value={true}>
        <Layout title="Catalog tab">
          <p>nested body</p>
        </Layout>
      </LayoutNestedContext.Provider>
    );
    expect(screen.getByText('nested body')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  // Round D (browser journey): Products opens as a tab of Catalog — the only
  // way in from the sidebar — and its search box lived in the header that a
  // tab does not draw, so products could not be searched at all.
  it('a tab that searches keeps its search box', () => {
    const onSearch = jest.fn();
    render(
      <LayoutNestedContext.Provider value={true}>
        <Layout title="Products" searchPlaceholder="Search products..." onSearch={onSearch}>
          <p>nested body</p>
        </Layout>
      </LayoutNestedContext.Provider>
    );
    const box = screen.getByRole('textbox', { name: 'Search products...' });
    fireEvent.change(box, { target: { value: 'tomato' } });
    expect(onSearch).toHaveBeenCalledWith('tomato');
    expect(screen.getByText('nested body')).toBeInTheDocument();
  });

  it('a tab without search draws no search box', () => {
    render(
      <LayoutNestedContext.Provider value={true}>
        <Layout title="Categories">
          <p>nested body</p>
        </Layout>
      </LayoutNestedContext.Provider>
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
