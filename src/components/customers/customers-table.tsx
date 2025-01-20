import { useState, useMemo, forwardRef, useImperativeHandle, useEffect, useCallback } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Phone, Mail, MapPin, ArrowUpDown, Play, GripVertical, MessageSquareOff, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Customer } from '@/types/customers' // You might need to create this types file
import { formatPhoneNumber, formatDate } from '@/lib/utils'
import { CampaignBadge } from './campaign-badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRedaction } from '@/contexts/redaction-context'
import { useNavigate } from 'react-router-dom'

interface SortableHeaderProps {
  header: { key: string; label: string };
  onSort: () => void;
}

function SortableHeader({ header, onSort }: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: header.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableHead ref={setNodeRef} style={style}>
      <Button
        variant="ghost"
        onClick={onSort}
        className="hover:text-gray-900 text-gray-600 flex items-center gap-2 px-2 h-10"
      >
        <GripVertical 
          className="h-4 w-4 text-muted-foreground cursor-grab" 
          {...attributes} 
          {...listeners}
        />
        {header.label}
        <ArrowUpDown className="h-4 w-4" />
      </Button>
    </TableHead>
  );
}

interface CustomersTableProps {
  customers: Customer[];
  onCustomerSelect?: (customer: Customer) => void;
  onSort: (key: string, direction: 'asc' | 'desc' | null) => void;
  sortConfig: {
    key: string;
    direction: 'asc' | 'desc' | null;
  };
}

const redactData = (value: string) => {
  return value.replace(/./g, '*');
};

export const CustomersTable = forwardRef(({ 
  customers, 
  onCustomerSelect,
  onSort,
  sortConfig 
}: CustomersTableProps, ref) => {
  const { isRedacted } = useRedaction();
  const navigate = useNavigate();
  const [columns, setColumns] = useState(() => [
    { 
      key: "customer", 
      label: "Customer", 
      render: (customer: Customer) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {renderCustomerName(customer.firstName, customer.lastName)}
          </span>
          <span className="text-sm text-gray-500">
            {renderCustomerId(customer.id)}
          </span>
        </span>
      )
    },
    { 
      key: "contact", 
      label: "Contact", 
      render: (customer: Customer) => (
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-500" />
            <span>
              {renderContact(customer.callerId)}
            </span>
          </span>
          {customer.email && (
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <span>
                {renderContact(customer.email)}
              </span>
            </span>
          )}
        </span>
      )
    },
    { key: "location", label: "Location", render: (customer: Customer) => (
      <span className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-500" />
        <span>
          {[
            customer.state,
            customer.timezone,
            customer.postalCode
          ].filter(Boolean).join(', ') || '-'}
        </span>
      </span>
    )},
    { key: "campaigns", label: "Active Campaigns", render: (customer: Customer) => (
      <div className="flex flex-wrap gap-2">
        {customer.campaigns?.map((campaign) => (
          <CampaignBadge
            key={campaign.campaign_id}
            name={campaign.campaign_name}
            status={campaign.campaign_status}
          />
        ))}
      </div>
    )},
    { 
      key: "calls", 
      label: "Total Calls", 
      render: (customer: Customer) => (
        <div 
          className="text-center w-full cursor-pointer hover:text-primary transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            const searchParams = new URLSearchParams();
            searchParams.set('search', customer.callerId || '');
            searchParams.set('from', customer.lastCallDate || '2020-01-01');
            searchParams.set('to', new Date().toISOString().split('T')[0]);
            
            navigate(`/calls?${searchParams.toString()}`);
          }}
        >
          {customer.totalCalls || 0}
        </div>
      )
    },
    { key: "last-contact", label: "Last Contact", render: (customer: Customer) => (
      formatDate(customer.lastCallDate)
    )}
  ]);

  const renderCustomerName = useCallback((firstName: string, lastName?: string) => {
    return `${firstName} ${isRedacted && lastName ? '*'.repeat(lastName.length) : lastName || ''}`;
  }, [isRedacted]);

  const renderCustomerId = useCallback((id?: string) => {
    return `ID: ${isRedacted && id ? '*'.repeat(id.length) : id || ''}`;
  }, [isRedacted]);

  const renderContact = useCallback((value?: string) => {
    if (!value) return '';
    if (isRedacted) return '*'.repeat(value.length);
    
    // If it's a phone number (simple check for length and digits)
    if (value.replace(/\D/g, '').length >= 10) {
      return formatPhoneNumber(value);
    }
    return value;
  }, [isRedacted]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null;
      }
    }
    
    onSort(key, direction);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex(col => col.key === active.id);
        const newIndex = items.findIndex(col => col.key === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const availableColumns = useMemo(() => {
    const defaultColumns = columns.map(col => ({
      key: col.key,
      label: col.label
    }));

    const sampleCustomer = customers.find(c => c.customData && Object.keys(c.customData).length > 0);
    if (!sampleCustomer?.customData) return defaultColumns;

    const existingKeys = new Set(defaultColumns.map(col => col.key));

    const customDataColumns = Object.keys(sampleCustomer.customData)
      .map(key => ({
        key: `custom_${key}`,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        isCustom: true,
        render: (customer: Customer) => customer.customData?.[key] || '-'
      }))
      .filter(col => !existingKeys.has(col.key));

    return [...defaultColumns, ...customDataColumns];
  }, [customers, columns]);

  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(() => 
    columns.map(col => col.key)
  );

  const handleColumnToggle = (columnKey: string) => {
    setActiveColumnKeys(prev => {
      const isActive = prev.includes(columnKey);
      if (isActive) {
        return prev.filter(key => key !== columnKey);
      } else {
        return [...prev, columnKey];
      }
    });

    if (!columns.some(col => col.key === columnKey)) {
      const customColumn = availableColumns.find(col => col.key === columnKey);
      if (customColumn) {
        const newColumn = {
          key: customColumn.key,
          label: customColumn.label,
          render: (customer: Customer) => {
            const fieldKey = customColumn.key.replace('custom_', '');
            return customer.customData?.[fieldKey] || '-';
          }
        };
        setColumns(prev => [...prev, newColumn]);
      }
    }
  };

  const activeColumns = useMemo(() => {
    return columns.filter(col => activeColumnKeys.includes(col.key));
  }, [columns, activeColumnKeys]);

  useImperativeHandle(ref, () => ({
    availableColumns,
    activeColumnKeys,
    handleColumnToggle
  }));

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-md border glass-panel w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                {/* Play button column header */}
              </TableHead>
              <SortableContext 
                items={activeColumns.map(col => col.key)} 
                strategy={horizontalListSortingStrategy}
              >
                {activeColumns.map((column) => (
                  <SortableHeader
                    key={column.key}
                    header={column}
                    onSort={() => handleSort(column.key)}
                  />
                ))}
              </SortableContext>
              <TableHead className="w-8">
                {/* Empty header for consistency */}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow 
                key={`row-${customer.id}`}
                className="hover:bg-black/5 cursor-pointer"
                onClick={() => onCustomerSelect?.(customer)}
              >
                <TableCell>
                  <div className="h-8 w-8 flex items-center justify-center">
                    <Play className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TableCell>
                {activeColumns.map((column) => (
                  <TableCell key={`cell-${customer.id}-${column.key}`}>
                    {column.render(customer)}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {!customer.smsConsent && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center w-6 h-6">
                              <MessageSquareOff className="h-4 w-4 text-red-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="flex items-center">
                            <p className="text-sm whitespace-nowrap">No SMS Consent</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {customer.doNotContact && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center w-6 h-6">
                              <PhoneOff className="h-4 w-4 text-red-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="flex items-center">
                            <p className="text-sm whitespace-nowrap">Do Not Contact</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DndContext>
  );
}); 