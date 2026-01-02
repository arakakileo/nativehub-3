import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataTable } from './DataTable'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    tr: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode
      onClick?: () => void
      className?: string
    }) => (
      <tr onClick={onClick} className={className}>
        {children}
      </tr>
    ),
  },
}))

interface TestItem {
  id: string
  name: string
  status: string
  value: number
}

const mockData: TestItem[] = [
  { id: '1', name: 'Item 1', status: 'active', value: 100 },
  { id: '2', name: 'Item 2', status: 'pending', value: 200 },
  { id: '3', name: 'Item 3', status: 'inactive', value: 300 },
]

const columns = [
  { key: 'name' as const, header: 'Name' },
  { key: 'status' as const, header: 'Status' },
  { key: 'value' as const, header: 'Value' },
]

describe('DataTable', () => {
  describe('loading state', () => {
    it('should render loading skeleton when isLoading is true', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          keyField="id"
          isLoading={true}
        />
      )

      // Loading skeleton should have animate-pulse class
      const skeleton = document.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
    })

    it('should not render table when loading', () => {
      render(
        <DataTable
          data={mockData}
          columns={columns}
          keyField="id"
          isLoading={true}
        />
      )

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('should render default empty message when data is empty', () => {
      render(
        <DataTable data={[]} columns={columns} keyField="id" />
      )

      expect(screen.getByText('No data available')).toBeInTheDocument()
    })

    it('should render custom empty message', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          keyField="id"
          emptyMessage="No items found"
        />
      )

      expect(screen.getByText('No items found')).toBeInTheDocument()
    })

    it('should not render table when empty', () => {
      render(
        <DataTable data={[]} columns={columns} keyField="id" />
      )

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('data rendering', () => {
    it('should render table with data', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('should render column headers', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Value')).toBeInTheDocument()
    })

    it('should render all data rows', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(screen.getByText('Item 1')).toBeInTheDocument()
      expect(screen.getByText('Item 2')).toBeInTheDocument()
      expect(screen.getByText('Item 3')).toBeInTheDocument()
    })

    it('should render cell values correctly', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(screen.getByText('active')).toBeInTheDocument()
      expect(screen.getByText('pending')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('200')).toBeInTheDocument()
    })
  })

  describe('custom render', () => {
    it('should use custom render function for cells', () => {
      const columnsWithRender = [
        { key: 'name' as const, header: 'Name' },
        {
          key: 'status' as const,
          header: 'Status',
          render: (item: TestItem) => (
            <span data-testid="status-badge">{item.status.toUpperCase()}</span>
          ),
        },
      ]

      render(
        <DataTable
          data={mockData}
          columns={columnsWithRender}
          keyField="id"
        />
      )

      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
      expect(screen.getByText('PENDING')).toBeInTheDocument()
      expect(screen.getAllByTestId('status-badge')).toHaveLength(3)
    })
  })

  describe('row interaction', () => {
    it('should call onRowClick when row is clicked', () => {
      const handleRowClick = vi.fn()

      render(
        <DataTable
          data={mockData}
          columns={columns}
          keyField="id"
          onRowClick={handleRowClick}
        />
      )

      fireEvent.click(screen.getByText('Item 1').closest('tr')!)

      expect(handleRowClick).toHaveBeenCalledTimes(1)
      expect(handleRowClick).toHaveBeenCalledWith(mockData[0])
    })

    it('should pass correct item to onRowClick', () => {
      const handleRowClick = vi.fn()

      render(
        <DataTable
          data={mockData}
          columns={columns}
          keyField="id"
          onRowClick={handleRowClick}
        />
      )

      fireEvent.click(screen.getByText('Item 2').closest('tr')!)

      expect(handleRowClick).toHaveBeenCalledWith(mockData[1])
    })

    it('should not throw when clicking row without onRowClick', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(() => {
        fireEvent.click(screen.getByText('Item 1').closest('tr')!)
      }).not.toThrow()
    })
  })

  describe('column className', () => {
    it('should apply column className to header', () => {
      const columnsWithClass = [
        { key: 'name' as const, header: 'Name', className: 'text-right' },
      ]

      render(
        <DataTable
          data={mockData}
          columns={columnsWithClass}
          keyField="id"
        />
      )

      const header = screen.getByText('Name')
      expect(header.className).toContain('text-right')
    })

    it('should apply column className to cells', () => {
      const columnsWithClass = [
        { key: 'name' as const, header: 'Name', className: 'font-bold' },
      ]

      render(
        <DataTable
          data={mockData}
          columns={columnsWithClass}
          keyField="id"
        />
      )

      const cell = screen.getByText('Item 1')
      expect(cell.className).toContain('font-bold')
    })
  })

  describe('accessibility', () => {
    it('should have table structure', () => {
      render(
        <DataTable data={mockData} columns={columns} keyField="id" />
      )

      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getAllByRole('columnheader')).toHaveLength(3)
      expect(screen.getAllByRole('row')).toHaveLength(4) // 1 header + 3 data rows
    })
  })
})
