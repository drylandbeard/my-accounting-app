"use client";

import { useEffect, useState, useContext, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import { AISharedContext } from "@/components/AISharedContext";
import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"];

type Category = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
};

type Payee = {
  id: string;
  name: string;
  company_id: string;
};

type CategoryImportModalState = {
  isOpen: boolean;
  step: "upload" | "review";
  csvData: CategoryImportData[];
  isLoading: boolean;
  error: string | null;
  selectedCategories: Set<string>;
  autoCreateMissing: boolean;
};

type PayeeImportModalState = {
  isOpen: boolean;
  step: "upload" | "review";
  csvData: Payee[];
  isLoading: boolean;
  error: string | null;
  selectedPayees: Set<string>;
};

type CategoryCSVRow = {
  Name: string;
  Type: string;
  Parent?: string;
};

type PayeeCSVRow = {
  Name: string;
};

type CategoryImportData = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
  company_id?: string;
  isValid: boolean;
  validationMessage?: string;
  needsParentCreation?: boolean;
  parentName?: string;
};

type SortConfig = {
  key: "name" | "type" | "parent" | null;
  direction: "asc" | "desc";
};

type PayeeSortConfig = {
  key: "name" | null;
  direction: "asc" | "desc";
};

type SelectOption = {
  value: string;
  label: string;
};

export default function ChartOfAccountsPage() {
  const { hasCompanyContext, currentCompany } = useApiWithCompany();
  const { categories: accounts, refreshCategories } = useContext(AISharedContext);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [payeeSearch, setPayeeSearch] = useState("");
  const categoriesTableRef = useRef<HTMLDivElement>(null);

  // Add new account state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentOptions, setParentOptions] = useState<Category[]>([]);

  // Add new payee state
  const [newPayeeName, setNewPayeeName] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editParentId, setEditParentId] = useState<string | null>(null);
  
  // Refs to store the latest values for immediate access
  const editParentIdRef = useRef<string | null>(null);
  const editTypeRef = useRef<string>("");

  // Payee edit state
  const [editingPayeeId, setEditingPayeeId] = useState<string | null>(null);
  const [editPayeeName, setEditPayeeName] = useState("");

  // AI Integration - Real-time and focus states
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [lastActionId, setLastActionId] = useState<string | null>(null);

  // Import modal state
  const [categoryImportModal, setCategoryImportModal] = useState<CategoryImportModalState>({
    isOpen: false,
    step: "upload",
    csvData: [],
    isLoading: false,
    error: null,
    selectedCategories: new Set(),
    autoCreateMissing: false,
  });

  const [payeeImportModal, setPayeeImportModal] = useState<PayeeImportModalState>({
    isOpen: false,
    step: "upload",
    csvData: [],
    isLoading: false,
    error: null,
    selectedPayees: new Set(),
  });

  // Sorting state
  const [categorySortConfig, setCategorySortConfig] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  const [payeeSortConfig, setPayeeSortConfig] = useState<PayeeSortConfig>({
    key: null,
    direction: "asc",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [payeeCurrentPage, setPayeeCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Fixed items per page

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setPayeeCurrentPage(1);
  }, [payeeSearch]);

  // Pagination utility function
  const getPaginatedData = <T,>(data: T[], currentPage: number, itemsPerPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedData: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      totalItems: data.length,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, data.length),
    };
  };

  // Custom Pagination Component
  const CustomPagination = ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  }) => {
    if (totalPages <= 1) return null;

    const getVisiblePages = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];

      for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, "...");
      } else {
        rangeWithDots.push(1);
      }

      rangeWithDots.push(...range);

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push("...", totalPages);
      } else {
        rangeWithDots.push(totalPages);
      }

      return rangeWithDots;
    };

    return (
      <Pagination className="justify-start">
        <PaginationContent className="gap-1">
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}

          {getVisiblePages().map((page, index) => (
            <PaginationItem key={index}>
              {page === "..." ? (
                <PaginationEllipsis className="border px-3 py-1 rounded text-xs h-auto bg-gray-100" />
              ) : (
                <PaginationLink
                  onClick={() => onPageChange(page as number)}
                  isActive={page === currentPage}
                  className={`border px-3 py-1 rounded text-xs h-auto cursor-pointer ${
                    page === currentPage ? "bg-gray-200 text-gray-900 font-semibold" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          {currentPage < totalPages && (
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    );
  };

  // AI Integration - Highlight a category and scroll to it
  const highlightCategory = useCallback((categoryId: string) => {
    setHighlightedIds((prev) => new Set([...prev, categoryId]));
    setLastActionId(categoryId);

    setTimeout(() => {
      const element = document.getElementById(`category-${categoryId}`);
      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 100);

    setTimeout(() => {
      setHighlightedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
      setLastActionId((currentId) => (currentId === categoryId ? null : currentId));
    }, 3000);
  }, []);

  useEffect(() => {
    if (accounts) {
      setLoading(false);
    }
  }, [accounts]);

  // Options for Select components
  const typeOptions: SelectOption[] = ACCOUNT_TYPES.map(type => ({
    value: type,
    label: type
  }));

  const getParentOptions = (currentId?: string, type?: string): SelectOption[] => {
    const availableParents = accounts.filter((cat: Category) => 
      cat.id !== currentId && 
      (type ? cat.type === type : true)
    );
    return [
      { value: "", label: "None" },
      ...availableParents.map((cat: Category) => ({
        value: cat.id,
        label: cat.name
      }))
    ];
  };

  const fetchParentOptions = useCallback(async () => {
    if (!hasCompanyContext || !currentCompany?.id) return;

    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", currentCompany!.id)
      .is("parent_id", null);

    if (error) {
      console.error("Error fetching parent options:", error);
    } else if (data) {
      setParentOptions(data as Category[]);
    }
  }, [currentCompany?.id, hasCompanyContext]);

  useEffect(() => {
    fetchParentOptions();
    fetchPayees();
  }, [currentCompany?.id, hasCompanyContext, fetchParentOptions]);

  // AI Integration - Set up real-time subscription
  useEffect(() => {
    if (!hasCompanyContext || !currentCompany?.id) return;

    console.log("Setting up real-time subscription for company:", currentCompany.id);

    const channel = supabase
      .channel(`chart_of_accounts_${currentCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chart_of_accounts",
          filter: `company_id=eq.${currentCompany.id}`,
        },
        (payload) => {
          console.log("Real-time change detected:", payload);
          refreshCategories();

          let recordId: string | null = null;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            recordId = payload.new.id;
          }

          if (recordId) {
            highlightCategory(recordId);
          }

          fetchParentOptions();
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    return () => {
      console.log("Cleaning up real-time subscription");
      supabase.removeChannel(channel);
    };
  }, [currentCompany?.id, hasCompanyContext, highlightCategory, fetchParentOptions, refreshCategories]);

  // Sorting functions
  const sortCategories = (categories: Category[], sortConfig: SortConfig) => {
    if (!sortConfig.key) return categories;

    return [...categories].sort((a, b) => {
      if (sortConfig.key === "name") {
        return sortConfig.direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortConfig.key === "type") {
        return sortConfig.direction === "asc" ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
      }
      if (sortConfig.key === "parent") {
        const aParent = a.parent_id ? accounts.find((acc) => acc.id === a.parent_id)?.name || "" : "";
        const bParent = b.parent_id ? accounts.find((acc) => acc.id === b.parent_id)?.name || "" : "";
        return sortConfig.direction === "asc" ? aParent.localeCompare(bParent) : bParent.localeCompare(aParent);
      }
      return 0;
    });
  };

  const sortPayees = (payees: Payee[], sortConfig: PayeeSortConfig) => {
    if (!sortConfig.key) return payees;

    return [...payees].sort((a, b) => {
      if (sortConfig.key === "name") {
        return sortConfig.direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return 0;
    });
  };

  const handleCategorySort = (key: "name" | "type" | "parent") => {
    setCategorySortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handlePayeeSort = (key: "name") => {
    setPayeeSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const fetchPayees = async () => {
    if (!hasCompanyContext) return;

    const { data, error } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", currentCompany!.id)
      .order("name");
    if (!error && data) setPayees(data);
  };

  const filteredAccounts = sortCategories(
    accounts.filter((account) => {
      const searchLower = search.toLowerCase();
      const matchesName = account.name.toLowerCase().includes(searchLower);
      const matchesType = account.type.toLowerCase().includes(searchLower);

      // Check if parent name matches (for subaccounts)
      let matchesParent = false;
      if (account.parent_id) {
        const parentAccount = accounts.find((acc) => acc.id === account.parent_id);
        if (parentAccount) {
          matchesParent = parentAccount.name.toLowerCase().includes(searchLower);
        }
      }

      // If this account matches the search, include it
      if (matchesName || matchesType || matchesParent) return true;

      // If this is a parent account, check if any of its children match
      if (account.parent_id === null) {
        const hasMatchingChild = accounts.some(
          (child) =>
            child.parent_id === account.id &&
            (child.name.toLowerCase().includes(searchLower) || child.type.toLowerCase().includes(searchLower))
        );
        return hasMatchingChild;
      }

      return false;
    }),
    categorySortConfig
  );

  const filteredPayees = sortPayees(
    payees.filter((payee) => payee.name.toLowerCase().includes(payeeSearch.toLowerCase())),
    payeeSortConfig
  );

  // Get paginated data for categories and payees
  const categoryPaginationData = getPaginatedData(filteredAccounts, currentPage, itemsPerPage);
  const payeePaginationData = getPaginatedData(filteredPayees, payeeCurrentPage, itemsPerPage);

  const displayedCategories = categoryPaginationData.paginatedData;
  const displayedPayees = payeePaginationData.paginatedData;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newType || !hasCompanyContext) return;
    const { error } = await supabase.from("chart_of_accounts").insert([
      {
        name: newName,
        type: newType,
        parent_id: parentId || null,
        company_id: currentCompany!.id,
      },
    ]);
    if (!error) {
      setNewName("");
      setNewType("");
      setParentId(null);
      // Categories will be refreshed automatically via real-time subscription
      fetchParentOptions();
    }
  };

  const handleAddPayee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayeeName || !hasCompanyContext) return;
    const { error } = await supabase.from("payees").insert([
      {
        name: newPayeeName,
        company_id: currentCompany!.id,
      },
    ]);
    if (!error) {
      setNewPayeeName("");
      fetchPayees();
    }
  };

  const handleDelete = async (id: string) => {
    // First check if this category is linked to a bank account
    const { data: categoryData, error: categoryError } = await supabase
      .from("chart_of_accounts")
      .select("plaid_account_id, name")
      .eq("id", id)
      .single();

    if (categoryError) {
      console.error("Error checking category:", categoryError);
      alert("Error checking category details. Please try again.");
      return;
    }

    if (categoryData?.plaid_account_id) {
      alert(
        `This category "${categoryData.name}" cannot be deleted because it is linked to a bank account. Bank account categories are automatically managed by the system.`
      );
      return;
    }

    // Check if this category has subcategories
    const { data: subcategories } = await supabase
      .from("chart_of_accounts")
      .select("id, name")
      .eq("parent_id", id);

    if (subcategories && subcategories.length > 0) {
      // This category has subcategories - prevent deletion
      alert(
        `This category cannot be deleted because it has ${subcategories.length} subcategor${subcategories.length === 1 ? 'y' : 'ies'}. Please delete or reassign the subcategories first.`
      );
      return;
    }

    // Check if this category is used in transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id")
      .or(`selected_category_id.eq.${id},corresponding_category_id.eq.${id}`)
      .limit(1);

    if (txError) {
      console.error("Error checking transactions:", txError);
      alert("Error checking if category is in use. Please try again.");
      return;
    }

    if (transactions && transactions.length > 0) {
      alert(
        "This category cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first."
      );
      return;
    }

    // Show confirmation dialog before deleting
    const categoryToDelete = accounts.find(acc => acc.id === id);
    const categoryName = categoryToDelete?.name || "this category";
    
    if (!window.confirm(`Are you sure you want to delete "${categoryName}"? This action cannot be undone.`)) {
      return;
    }

    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) {
      console.error("Error deleting category:", error);
      alert("Failed to delete category. Please try again.");
    } else {
      setEditingId(null);
      // Categories will be refreshed automatically via real-time subscription
      fetchParentOptions();
    }
  };

  const handleDeletePayee = async (id: string) => {
    // Check if payee is used in transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id")
      .eq("payee_id", id)
      .limit(1);

    if (txError) {
      console.error("Error checking transactions:", txError);
      alert("Error checking if payee is in use. Please try again.");
      return;
    }

    if (transactions && transactions.length > 0) {
      alert(
        "This payee cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first."
      );
      return;
    }

    // Show confirmation dialog before deleting
    const payeeToDelete = payees.find(payee => payee.id === id);
    const payeeName = payeeToDelete?.name || "this payee";
    
    if (!window.confirm(`Are you sure you want to delete "${payeeName}"? This action cannot be undone.`)) {
      return;
    }

    const { error } = await supabase.from("payees").delete().eq("id", id);
    if (error) {
      console.error("Error deleting payee:", error);
      alert("Failed to delete payee. Please try again.");
    } else {
      setEditingPayeeId(null);
      fetchPayees();
    }
  };

  const handleEdit = (account: Category) => {
    setEditingId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditParentId(account.parent_id || null);
    // Also set the refs for immediate access
    editTypeRef.current = account.type;
    editParentIdRef.current = account.parent_id || null;
  };

  const handleEditPayee = (payee: Payee) => {
    setEditingPayeeId(payee.id);
    setEditPayeeName(payee.name);
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    // Get current values from React state since we're using React components
    const getCurrentValues = () => {
      // Get the name from the input field in the DOM as it might have been changed
      let name = editName;
      if (categoriesTableRef.current) {
        const nameInput = categoriesTableRef.current.querySelector('tr input[type="text"]') as HTMLInputElement;
        if (nameInput) {
          name = nameInput.value || editName;
        }
      }

      // Use refs for both type and parent since changes need immediate access
      let parent_id = editParentIdRef.current;
      const type = editTypeRef.current;


      // Convert empty string to null (for "No Parent" selection)
      if (parent_id === "" || parent_id === undefined || parent_id === "null") {
        console.log("Converting empty/undefined parent_id to null");
        parent_id = null;
      }

      // Validate parent type matches category type - if not, clear parent
      if (parent_id) {
        const parentCategory = accounts.find((acc) => acc.id === parent_id);
        if (parentCategory && parentCategory.type !== type) {
          parent_id = null;
        }
      }



      return {
        name,
        type,
        parent_id: parent_id as string | null,
      };
    };

    const currentValues = getCurrentValues();
    const editingIdToUpdate = editingId;

    // Immediately exit editing mode and refresh to show updated values optimistically
    setEditingId(null);

    try {
      // First get the current chart_of_accounts record to check if it has a plaid_account_id
      const { data: currentAccount, error: fetchError } = await supabase
        .from("chart_of_accounts")
        .select("plaid_account_id")
        .eq("id", editingIdToUpdate)
        .single();

      if (fetchError) {
        console.error("Error fetching current account:", fetchError);
        alert("Error fetching account data. Please try again.");
        // Refresh to revert any optimistic changes
        await refreshCategories();
        return;
      }

      // Update chart_of_accounts
      const { error } = await supabase
        .from("chart_of_accounts")
        .update({
          name: currentValues.name,
          type: currentValues.type,
          parent_id: currentValues.parent_id === "" ? null : currentValues.parent_id,
        })
        .eq("id", editingIdToUpdate);

      if (error) {
        console.error("Error updating chart of accounts:", error);
        alert("Error saving changes. Please try again.");
        // Refresh to revert any optimistic changes
        await refreshCategories();
        return;
      }

      console.log("Successfully updated chart of accounts");

      // If this chart of accounts entry is linked to a plaid account, also update the accounts table
      if (currentAccount?.plaid_account_id) {
        const { error: accountsError } = await supabase
          .from("accounts")
          .update({
            name: currentValues.name,
            type: currentValues.type,
          })
          .eq("plaid_account_id", currentAccount.plaid_account_id)
          .eq("company_id", currentCompany!.id);

        if (accountsError) {
          console.error("Error updating accounts table:", accountsError);
          // Don't return here as the main update succeeded
        }
      }

      // Refresh categories to ensure consistency with database
      await refreshCategories();
      await fetchParentOptions();
      console.log("Update completed successfully");
    } catch (error) {
      console.error("Unexpected error during update:", error);
      alert("An unexpected error occurred. Please try again.");
      // Refresh to revert any optimistic changes
      await refreshCategories();
    }
  };

  // Handle clicks outside the table or on other rows to save changes
  useEffect(() => {
    const handleClickToSave = (event: MouseEvent) => {
      if (!editingId || !categoriesTableRef.current) return;

      const target = event.target as Element;

      // Check if the click is on a Select dropdown or its components
      const isSelectDropdown = target.closest('.react-select__control') ||
                               target.closest('.react-select__dropdown-indicator') ||
                               target.closest('.react-select__menu') ||
                               target.closest('.react-select__menu-list') ||
                               target.closest('.react-select__option') ||
                               target.closest('.react-select__input') ||
                               target.closest('[class*="react-select"]') ||
                               target.closest('[role="listbox"]') ||
                               target.closest('[role="option"]') ||
                               target.closest('[role="combobox"]');

      // If clicking on Select dropdown, don't save
      if (isSelectDropdown) {
        return;
      }

      // If click is outside the table, save
      if (!categoriesTableRef.current.contains(target)) {
        handleUpdate();
        return;
      }

      // If click is inside the table, check if it's on a different row
      const clickedRow = target.closest("tr");
      if (clickedRow) {
        // Get all the input/select elements in the currently editing row
        const editingInputs = categoriesTableRef.current.querySelectorAll(`tr input[type="text"], tr select`);

        // Also check for Select components by looking for the editing row ID
        const editingRow = categoriesTableRef.current.querySelector(`tr:has(input[type="text"]:focus), tr:has(.react-select__control)`);
        
        // Check if the clicked element is one of the editing inputs or within the editing row
        const isClickOnCurrentEditingElement = Array.from(editingInputs).some(
          (input) => input.contains(target) || input === target
        ) || (editingRow && editingRow.contains(target));

        // If not clicking on the current editing elements, save
        if (!isClickOnCurrentEditingElement) {
          handleUpdate();
        }
      }
    };

    document.addEventListener("mousedown", handleClickToSave);
    return () => {
      document.removeEventListener("mousedown", handleClickToSave);
    };
  }, [editingId]);

  const handleUpdatePayee = async () => {
    if (!editingPayeeId) return;

    const { error } = await supabase
      .from("payees")
      .update({
        name: editPayeeName,
      })
      .eq("id", editingPayeeId);

    if (!error) {
      setEditingPayeeId(null);
      fetchPayees();
    }
  };

  const downloadCategoriesTemplate = () => {
    const csvContent =
      "Name,Type,Parent\nOperating Expenses,Expense,\nOffice Supplies,Expense,Operating Expenses\nUtilities,Expense,Operating Expenses\nBank Fees,Expense,\nAdvertising,Expense,\nCurrent Assets,Asset,\nCash,Asset,Current Assets\nAccounts Receivable,Asset,Current Assets\nSales Revenue,Revenue,\nService Revenue,Revenue,";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "categories_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadPayeesTemplate = () => {
    const csvContent = "Name\nVendor 1\nVendor 2\nClient 1\nClient 2";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payees_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportCategories = () => {
    if (!accounts.length) return;

    const csvData = accounts.map((account) => {
      const parentAccount = account.parent_id ? accounts.find((acc) => acc.id === account.parent_id) : null;
      return {
        Name: account.name,
        Type: account.type,
        Parent: parentAccount?.name || "",
      };
    });

    const csvContent = Papa.unparse(csvData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `categories_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPayees = () => {
    if (!payees.length) return;

    const csvData = payees.map((payee) => ({
      Name: payee.name,
    }));

    const csvContent = Papa.unparse(csvData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payees_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Import validation functions
  const validateCategoryCSV = (data: Papa.ParseResult<CategoryCSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name", "Type"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: Name, Type, Parent (optional)`;
    }

    const nonEmptyRows = data.data.filter((row) => row.Name && row.Type);

    if (nonEmptyRows.length === 0) {
      return "No valid category data found. Please ensure you have at least one row with Name and Type.";
    }

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each category.`;
      }

      if (!ACCOUNT_TYPES.includes(row.Type)) {
        return `Invalid type "${row.Type}" in row ${i + 1}. Valid types are: ${ACCOUNT_TYPES.join(", ")}`;
      }
    }

    return null;
  };

  // Validate parent references and detect missing parents
  const validateParentReferences = (categories: CategoryImportData[]): CategoryImportData[] => {
    return categories.map((category) => {
      let isValid = true;
      let validationMessage = "";
      let needsParentCreation = false;

      // Check for name uniqueness - must not exist in database
      const nameExistsInDb = accounts.some(
        (acc) => acc.name.toLowerCase() === category.name.toLowerCase()
      );
      
      if (nameExistsInDb) {
        isValid = false;
        validationMessage = `Category "${category.name}" already exists in database`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Check for name uniqueness within CSV data
      const duplicatesInCsv = categories.filter(
        (cat) => cat.name.toLowerCase() === category.name.toLowerCase()
      );
      
      if (duplicatesInCsv.length > 1) {
        isValid = false;
        validationMessage = `Duplicate name "${category.name}" found in CSV`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Validate parent references
      if (category.parentName) {
        // Check if parent exists in current accounts
        const parentExists = accounts.some(
          (acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase()
        );
        
        // Check if parent exists in the import data
        const parentInImport = categories.find(
          (cat) => cat.name.toLowerCase() === category.parentName!.toLowerCase() && cat.id !== category.id
        );

        if (!parentExists && !parentInImport) {
          needsParentCreation = true;
          validationMessage = `Parent "${category.parentName}" does not exist`;
        } else if (parentExists || parentInImport) {
          // Validate that parent type matches (parents must have same type as child)
          const existingParent = accounts.find((acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase());
          const importParent = parentInImport;
          
          const parentType = existingParent?.type || importParent?.type;
          if (parentType && parentType !== category.type) {
            isValid = false;
            validationMessage = `Parent "${category.parentName}" has type "${parentType}" but child has type "${category.type}". Parent and child must have the same type.`;
          }
        }

        // Check if parent is in CSV but not selected for import
        if (parentInImport) {
          // This will be handled at the selection level, not here
          // We'll add this check when user tries to import
        }
      }

      return {
        ...category,
        isValid,
        validationMessage,
        needsParentCreation,
      };
    });
  };

  // Validate that if a parent is in the CSV, it must be selected if its children are selected
  const validateParentDependencies = (
    categories: CategoryImportData[], 
    selectedIds: Set<string>
  ): { isValid: boolean; missingParents: string[] } => {
    const missingParents: string[] = [];
    
    const selectedCategories = categories.filter(cat => selectedIds.has(cat.id));
    
    for (const category of selectedCategories) {
      if (category.parentName) {
        // Find if the parent is in the CSV data
        const parentInCsv = categories.find(
          cat => cat.name.toLowerCase() === category.parentName!.toLowerCase()
        );
        
        // If parent is in CSV but not selected, add to missing parents
        if (parentInCsv && !selectedIds.has(parentInCsv.id)) {
          if (!missingParents.includes(category.parentName)) {
            missingParents.push(category.parentName);
          }
        }
      }
    }
    
    return {
      isValid: missingParents.length === 0,
      missingParents
    };
  };

  const validatePayeeCSV = (data: Papa.ParseResult<PayeeCSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: Name`;
    }

    const nonEmptyRows = data.data.filter((row) => row.Name);

    if (nonEmptyRows.length === 0) {
      return "No valid payee data found. Please ensure you have at least one row with Name.";
    }

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each payee.`;
      }
    }

    return null;
  };

  // Import file handling functions
  const handleCategoryFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent ? event.dataTransfer?.files[0] : event.target.files?.[0];

    if (!file) return;

    setCategoryImportModal((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CategoryCSVRow>) => {
        const error = validateCategoryCSV(results);
        if (error) {
          setCategoryImportModal((prev) => ({
            ...prev,
            isLoading: false,
            error,
          }));
          return;
        }

        const categories: CategoryImportData[] = results.data
          .filter((row: CategoryCSVRow) => row.Name && row.Type)
          .map((row: CategoryCSVRow) => {
            const parentCategory = row["Parent"] ? accounts.find((acc) => acc.name === row["Parent"]) : null;

            return {
              id: uuidv4(),
              name: row.Name.trim(),
              type: row.Type,
              parent_id: parentCategory?.id || null,
              company_id: currentCompany?.id || "",
              parentName: row.Parent?.trim() || undefined,
              // Initialize validation fields - will be populated by validateParentReferences
              isValid: true,
              validationMessage: "",
              needsParentCreation: false,
            };
          });

        // Validate parent references
        const validatedCategories = validateParentReferences(categories);

        setCategoryImportModal((prev) => ({
          ...prev,
          isLoading: false,
          csvData: validatedCategories,
          step: "review",
        }));
      },
      error: (error) => {
        setCategoryImportModal((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`,
        }));
      },
    });
  };

  const handlePayeeFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent ? event.dataTransfer?.files[0] : event.target.files?.[0];

    if (!file) return;

    setPayeeImportModal((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<PayeeCSVRow>) => {
        const error = validatePayeeCSV(results);
        if (error) {
          setPayeeImportModal((prev) => ({
            ...prev,
            isLoading: false,
            error,
          }));
          return;
        }

        const payeeData = results.data
          .filter((row: PayeeCSVRow) => row.Name)
          .map((row: PayeeCSVRow) => ({
            id: uuidv4(),
            name: row.Name.trim(),
            company_id: currentCompany?.id || "",
          }));

        setPayeeImportModal((prev) => ({
          ...prev,
          isLoading: false,
          csvData: payeeData,
          step: "review",
        }));
      },
      error: (error) => {
        setPayeeImportModal((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`,
        }));
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCategoryDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleCategoryFileUpload(event);
    }
  };

  const handlePayeeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handlePayeeFileUpload(event);
    }
  };

  // Helper to display subaccounts indented with AI highlighting
  const renderAccounts = (accounts: Category[], level = 0) => {
    // Get all parent accounts
    const parentAccounts = accounts.filter((acc) => acc.parent_id === null);

    return parentAccounts
      .flatMap((parent) => {
        // Get subaccounts for this parent
        const subAccounts = accounts.filter((acc) => acc.parent_id === parent.id);

        // If there are no subaccounts and parent doesn't match search, don't show parent
        if (subAccounts.length === 0 && !accounts.includes(parent)) {
          return [];
        }

        // Return an array of <tr> elements: parent row + subaccount rows
        return [
          <tr
            key={parent.id}
            id={`category-${parent.id}`}
            className={`transition-colors duration-1000 ${
              highlightedIds.has(parent.id) ? "bg-green-100" : "hover:bg-gray-50"
            }`}
          >
            <td style={{ paddingLeft: `${level * 16 + 4}px` }} className="border p-1 text-xs">
              {editingId === parent.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border-none outline-none bg-transparent text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                  autoFocus
                />
              ) : (
                <span className={highlightedIds.has(parent.id) ? "font-bold text-green-800" : ""}>{parent.name}</span>
              )}
              {lastActionId === parent.id && <span className="ml-2 inline-block text-green-600">✨</span>}
            </td>
            <td className="border p-1 text-xs">
              {editingId === parent.id ? (
                <Select
                  options={typeOptions}
                  value={typeOptions.find(opt => opt.value === editType) || typeOptions[0]}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option) {
                      setEditType(option.value);
                      editTypeRef.current = option.value; // Store in ref for immediate access
                      // Clear parent when type changes since parent must match type
                      setEditParentId(null);
                      editParentIdRef.current = null;
                    }
                  }}
                  isSearchable
                  className="w-full"
                  classNames={{
                    container: () => "w-full",
                    control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                    input: () => "w-px",
                    valueContainer: () => "px-1 py-0.5 h-7",
                    indicatorsContainer: () => "h-7",
                    indicatorSeparator: () => "bg-gray-300",
                    dropdownIndicator: () => "text-gray-500 p-1"
                  }}
                />
              ) : (
                parent.type
              )}
            </td>
            <td className="border p-1 text-xs">
              {editingId === parent.id ? (
                <Select
                  options={getParentOptions(parent.id, editType)}
                  value={getParentOptions(parent.id, editType).find(opt => opt.value === (editParentId || "")) || getParentOptions(parent.id, editType)[0]}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option) {
                      const newParentId = option.value === "" ? null : option.value;
                      setEditParentId(newParentId);
                      editParentIdRef.current = newParentId; // Store in ref for immediate access
                    }
                  }}
                  isSearchable
                  className="w-full"
                  classNames={{
                    container: () => "w-full",
                    control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                    input: () => "w-px",
                    valueContainer: () => "px-1 py-0.5 h-7",
                    indicatorsContainer: () => "h-7",
                    indicatorSeparator: () => "bg-gray-300",
                    dropdownIndicator: () => "text-gray-500 p-1"
                  }}
                />
              ) : (
                ""
              )}
            </td>
            <td className="border p-1 text-xs">
              <div className="flex gap-2 justify-center">
                {editingId === parent.id ? (
                  <>
                    <button onClick={handleUpdate} className="text-xs hover:underline text-blue-600">
                      Save
                    </button>
                    <button onClick={() => handleDelete(parent.id)} className="text-xs hover:underline text-red-600">
                      Delete
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleEdit(parent)} className="text-xs hover:underline text-blue-600">
                    Edit
                  </button>
                )}
              </div>
            </td>
          </tr>,
          ...subAccounts.map((subAcc) => (
            <tr
              key={subAcc.id}
              id={`category-${subAcc.id}`}
              className={`transition-colors duration-1000 ${
                highlightedIds.has(subAcc.id) ? "bg-green-100" : "hover:bg-gray-50"
              }`}
            >
              <td
                style={{
                  paddingLeft: `${(level + 1) * 16 + 4}px`,
                }}
                className="border p-1 text-xs"
              >
                {editingId === subAcc.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border-none outline-none bg-transparent text-xs"
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                    autoFocus
                  />
                ) : (
                  <span className={highlightedIds.has(subAcc.id) ? "font-bold text-green-800" : ""}>{subAcc.name}</span>
                )}
                {lastActionId === subAcc.id && <span className="ml-2 inline-block text-green-600">✨</span>}
              </td>
              <td className="border p-1 text-xs">
                {editingId === subAcc.id ? (
                  <Select
                    options={typeOptions}
                    value={typeOptions.find(opt => opt.value === editType) || typeOptions[0]}
                    onChange={(selectedOption) => {
                      const option = selectedOption as SelectOption | null;
                      if (option) {
                        setEditType(option.value);
                        editTypeRef.current = option.value; // Store in ref for immediate access
                        // Clear parent when type changes since parent must match type
                        setEditParentId(null);
                        editParentIdRef.current = null;
                      }
                    }}
                    isSearchable
                    className="w-full"
                    classNames={{
                      container: () => "w-full",
                      control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                      input: () => "w-px",
                      valueContainer: () => "px-1 py-0.5 h-7",
                      indicatorsContainer: () => "h-7",
                      indicatorSeparator: () => "bg-gray-300",
                      dropdownIndicator: () => "text-gray-500 p-1"
                    }}
                  />
                ) : (
                  subAcc.type
                )}
              </td>
              <td className="border p-1 text-xs">
                {editingId === subAcc.id ? (
                  <Select
                    options={getParentOptions(subAcc.id, editType)}
                    value={getParentOptions(subAcc.id, editType).find(opt => opt.value === (editParentId || "")) || getParentOptions(subAcc.id, editType)[0]}
                    onChange={(selectedOption) => {
                      const option = selectedOption as SelectOption | null;
                      if (option) {
                        const newParentId = option.value === "" ? null : option.value;
                        setEditParentId(newParentId);
                        editParentIdRef.current = newParentId; // Store in ref for immediate access
                      }
                    }}
                    isSearchable
                    className="w-full"
                    classNames={{
                      container: () => "w-full",
                      control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                      input: () => "w-px", // Prevents input from expanding based on content
                      valueContainer: () => "px-1 py-0.5 h-7",
                      indicatorsContainer: () => "h-7",
                      indicatorSeparator: () => "bg-gray-300",
                      dropdownIndicator: () => "text-gray-500 p-1"
                    }}
                  />
                ) : (
                  parent.name
                )}
              </td>
              <td className="border p-1 text-xs">
                <div className="flex gap-2 justify-center">
                  {editingId === subAcc.id ? (
                    <>
                      <button onClick={handleUpdate} className="text-xs hover:underline text-blue-600">
                        Save
                      </button>
                      <button onClick={() => handleDelete(subAcc.id)} className="text-xs hover:underline text-red-600">
                        Delete
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleEdit(subAcc)} className="text-xs hover:underline text-blue-600">
                      Edit
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )),
        ];
      })
      .filter(Boolean)
      .flat(); // Remove null entries and flatten
  };

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to manage chart of accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto font-sans text-gray-900">
      <div className="flex gap-8">
        {/* Categories Section - Left Side */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Categories</h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setCategoryImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="px-3 py-1 text-xs border border-gray-300 rounded bg-gray-100 hover:bg-gray-200"
              >
                Import
              </button>
              <button
                onClick={exportCategories}
                className="px-3 py-1 text-xs border border-gray-300 rounded bg-gray-100 hover:bg-gray-200"
              >
                Export
              </button>
            </div>
          </div>

          {/* Add Category Form */}
          <div className="mb-3">
            <form onSubmit={handleAddAccount} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Category Category Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                required
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-xs w-32"
                required
              >
                <option value="">Type...</option>
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={parentId || ""}
                onChange={(e) => setParentId(e.target.value || null)}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
              >
                <option value="">No Parent</option>
                {parentOptions
                  .filter((opt) => opt.type === newType || !newType)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.type})
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="border border-gray-300 px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200"
              >
                Add
              </button>
            </form>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search Categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Categories Table */}
          <div className="bg-white rounded shadow-sm" ref={categoriesTableRef}>
            {loading ? (
              <div className="p-4 text-center text-gray-500 text-xs">Loading...</div>
            ) : (
              <table className="w-full border-collapse border border-gray-300 text-xs table-fixed">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-32" />
                  <col className="w-40" />
                  <col className="w-24" />
                </colgroup>
                <thead className="bg-gray-100">
                  <tr>
                    <th
                      className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                      onClick={() => handleCategorySort("name")}
                    >
                      Name {categorySortConfig.key === "name" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                      onClick={() => handleCategorySort("type")}
                    >
                      Type {categorySortConfig.key === "type" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                      onClick={() => handleCategorySort("parent")}
                    >
                      Parent{" "}
                      {categorySortConfig.key === "parent" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="border p-1 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCategories.length > 0 ? (
                    renderAccounts(displayedCategories)
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center p-2 text-gray-500 text-xs">
                        No categories found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Categories Pagination */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {`${displayedCategories.length} of ${categoryPaginationData.totalItems} categories`}
            </span>
            <CustomPagination
              currentPage={currentPage}
              totalPages={categoryPaginationData.totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* Payees Section - Right Side */}
        <div className="w-96">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Payees</h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPayeeImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="px-3 py-1 border border-gray-300 rounded bg-gray-100 hover:bg-gray-200 text-xs"
              >
                Import
              </button>
              <button
                onClick={exportPayees}
                className="px-3 py-1 border border-gray-300 rounded bg-gray-100 hover:bg-gray-200 text-xs"
              >
                Export
              </button>
            </div>
          </div>

          {/* Add Payee Form */}
          <div className="mb-3">
            <form onSubmit={handleAddPayee} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Add Payee Name"
                value={newPayeeName}
                onChange={(e) => setNewPayeeName(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                required
              />
              <button
                type="submit"
                className="border border-gray-300 px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200"
              >
                Add
              </button>
            </form>
          </div>

          {/* Payee Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search Payees..."
              value={payeeSearch}
              onChange={(e) => setPayeeSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Payees Table */}
          <div className="bg-white rounded shadow-sm">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th
                    className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => handlePayeeSort("name")}
                  >
                    Name {payeeSortConfig.key === "name" && (payeeSortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="border p-1 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedPayees.length > 0 ? (
                  displayedPayees.map((payee) => (
                    <tr key={payee.id}>
                      <td className="border p-1 text-xs">
                        {editingPayeeId === payee.id ? (
                          <input
                            type="text"
                            value={editPayeeName}
                            onChange={(e) => setEditPayeeName(e.target.value)}
                            className="w-full border-none outline-none bg-transparent text-xs"
                            onBlur={handleUpdatePayee}
                            onKeyDown={(e) => e.key === "Enter" && handleUpdatePayee()}
                            autoFocus
                          />
                        ) : (
                          payee.name
                        )}
                      </td>
                      <td className="border p-1 text-xs">
                        <div className="flex gap-2 justify-center">
                          {editingPayeeId === payee.id ? (
                            <>
                              <button onClick={handleUpdatePayee} className="text-xs hover:underline text-blue-600">
                                Save
                              </button>
                              <button
                                onClick={() => handleDeletePayee(payee.id)}
                                className="text-xs hover:underline text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleEditPayee(payee)}
                              className="text-xs hover:underline text-blue-600"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="text-center p-2 text-gray-500 text-xs">
                      No payees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Payees Pagination */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {`${displayedPayees.length} of ${payeePaginationData.totalItems} payees`}
            </span>
            <CustomPagination
              currentPage={payeeCurrentPage}
              totalPages={payeePaginationData.totalPages}
              onPageChange={setPayeeCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Payee Import Modal */}
      {payeeImportModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Payees</h2>
              <button
                onClick={() =>
                  setPayeeImportModal((prev) => ({
                    ...prev,
                    isOpen: false,
                  }))
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {payeeImportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                {payeeImportModal.error}
              </div>
            )}

            {payeeImportModal.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-1">
                {payeeImportModal.step === "upload" && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                          <button
                            onClick={downloadPayeesTemplate}
                            className="text-sm text-gray-600 hover:text-gray-800"
                          >
                            Download Template
                          </button>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                          <ul className="text-sm text-blue-700 space-y-1">
                            <li>
                              • <strong>Name:</strong> Payee name (required)
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                        onDragOver={handleDragOver}
                        onDrop={handlePayeeDrop}
                      >
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handlePayeeFileUpload}
                          className="hidden"
                          id="payee-csv-upload"
                        />
                        <label
                          htmlFor="payee-csv-upload"
                          className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Choose CSV File
                        </label>
                        <p className="mt-2 text-sm text-gray-500">
                          Drag and drop your CSV file here, or click to browse
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <button
                        onClick={() =>
                          setPayeeImportModal((prev) => ({
                            ...prev,
                            isOpen: false,
                          }))
                        }
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {payeeImportModal.step === "review" && (
                  <>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Review Payees</h3>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                <input
                                  type="checkbox"
                                  checked={
                                    payeeImportModal.csvData.length > 0 &&
                                    payeeImportModal.selectedPayees.size === payeeImportModal.csvData.length
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setPayeeImportModal((prev) => ({
                                        ...prev,
                                        selectedPayees: new Set(payeeImportModal.csvData.map((payee) => payee.id)),
                                      }));
                                    } else {
                                      setPayeeImportModal((prev) => ({
                                        ...prev,
                                        selectedPayees: new Set(),
                                      }));
                                    }
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {payeeImportModal.csvData.map((payee) => (
                              <tr key={payee.id}>
                                <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                  <input
                                    type="checkbox"
                                    checked={payeeImportModal.selectedPayees.has(payee.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(payeeImportModal.selectedPayees);
                                      if (e.target.checked) {
                                        newSelected.add(payee.id);
                                      } else {
                                        newSelected.delete(payee.id);
                                      }
                                      setPayeeImportModal((prev) => ({
                                        ...prev,
                                        selectedPayees: newSelected,
                                      }));
                                    }}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{payee.name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-medium">
                        {payeeImportModal.selectedPayees.size > 0 && (
                          <span className="text-gray-600">{payeeImportModal.selectedPayees.size} selected</span>
                        )}
                      </div>
                      <div className="flex justify-end space-x-2 mt-4">
                        <button
                          onClick={() =>
                            setPayeeImportModal((prev) => ({
                              ...prev,
                              step: "upload",
                            }))
                          }
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            setPayeeImportModal((prev) => ({
                              ...prev,
                              isLoading: true,
                              error: null,
                            }));
                            try {
                              if (!currentCompany) {
                                throw new Error("No company selected. Please select a company first.");
                              }

                              const selectedPayees = payeeImportModal.csvData.filter((payee) =>
                                payeeImportModal.selectedPayees.has(payee.id)
                              );

                              if (selectedPayees.length === 0) {
                                throw new Error("No payees selected for import.");
                              }

                              const payeesToInsert = selectedPayees.map((payee) => ({
                                name: payee.name,
                                company_id: currentCompany.id,
                              }));

                              const { error } = await supabase.from("payees").insert(payeesToInsert);

                              if (error) {
                                throw new Error(error.message);
                              }

                              setPayeeImportModal({
                                isOpen: false,
                                step: "upload",
                                csvData: [],
                                isLoading: false,
                                error: null,
                                selectedPayees: new Set(),
                              });

                              fetchPayees();
                            } catch (error) {
                              setPayeeImportModal((prev) => ({
                                ...prev,
                                isLoading: false,
                                error:
                                  error instanceof Error ? error.message : "Failed to import payees. Please try again.",
                              }));
                            }
                          }}
                          className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Import Payees
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Import Modal */}
      {categoryImportModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Categories</h2>
              <button
                onClick={() =>
                  setCategoryImportModal((prev) => ({
                    ...prev,
                    isOpen: false,
                  }))
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {categoryImportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                {categoryImportModal.error}
              </div>
            )}

            {categoryImportModal.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-1">
                {categoryImportModal.step === "upload" && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                          <button
                            onClick={downloadCategoriesTemplate}
                            className="text-sm text-gray-600 hover:text-gray-800"
                          >
                            Download Template
                          </button>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                          <ul className="text-sm text-blue-700 space-y-1">
                            <li>
                              • <strong>Name:</strong> Category name (required)
                            </li>
                            <li>
                              • <strong>Type:</strong> One of: {ACCOUNT_TYPES.join(", ")}
                            </li>
                            <li>
                              • <strong>Parent:</strong> Name of parent category (optional)
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                        onDragOver={handleDragOver}
                        onDrop={handleCategoryDrop}
                      >
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCategoryFileUpload}
                          className="hidden"
                          id="category-csv-upload"
                        />
                        <label
                          htmlFor="category-csv-upload"
                          className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Choose CSV File
                        </label>
                        <p className="mt-2 text-sm text-gray-500">
                          Drag and drop your CSV file here, or click to browse
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <button
                        onClick={() =>
                          setCategoryImportModal((prev) => ({
                            ...prev,
                            isOpen: false,
                          }))
                        }
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {categoryImportModal.step === "review" && (
                  <>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Review Categories</h3>
                      </div>

                      {/* Missing parents warning and options */}
                      {categoryImportModal.csvData.some((cat) => cat.needsParentCreation) && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-yellow-800 mb-2">Missing Parent Categories Detected</h4>
                          <p className="text-sm text-yellow-700 mb-3">
                            Some categories reference parent categories that don&apos;t exist in your system.
                          </p>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={categoryImportModal.autoCreateMissing}
                              onChange={(e) =>
                                setCategoryImportModal((prev) => ({
                                  ...prev,
                                  autoCreateMissing: e.target.checked,
                                }))
                              }
                              className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                            />
                            <span className="text-sm text-yellow-700">
                              Automatically create missing parent categories during import (with same type as child)
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Parent dependency warning */}
                      {(() => {
                        const dependencyCheck = validateParentDependencies(
                          categoryImportModal.csvData, 
                          categoryImportModal.selectedCategories
                        );
                        
                        return !dependencyCheck.isValid && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <h4 className="text-sm font-medium text-orange-800 mb-2">Parent Dependencies Required</h4>
                            <p className="text-sm text-orange-700 mb-2">
                              Some selected categories have parents that are also in this CSV but not selected for import:
                            </p>
                            <ul className="text-sm text-orange-700 list-disc list-inside">
                              {dependencyCheck.missingParents.map((parentName) => (
                                <li key={parentName}>
                                  <strong>{parentName}</strong> - Must be selected to import its children
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                <input
                                  type="checkbox"
                                  checked={
                                    categoryImportModal.csvData.length > 0 &&
                                    categoryImportModal.selectedCategories.size === categoryImportModal.csvData.length
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      // Select all categories
                                      setCategoryImportModal((prev) => ({
                                        ...prev,
                                        selectedCategories: new Set(categoryImportModal.csvData.map((cat) => cat.id)),
                                      }));
                                    } else {
                                      // Deselect all categories
                                      setCategoryImportModal((prev) => ({
                                        ...prev,
                                        selectedCategories: new Set(),
                                      }));
                                    }
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Parent
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {categoryImportModal.csvData.map((category) => (
                              <tr
                                key={category.id}
                                className={`${
                                  category.needsParentCreation && !categoryImportModal.autoCreateMissing
                                    ? "bg-yellow-50"
                                    : !category.isValid
                                    ? "bg-red-50"
                                    : ""
                                }`}
                              >
                                <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                  <input
                                    type="checkbox"
                                    checked={categoryImportModal.selectedCategories.has(category.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(categoryImportModal.selectedCategories);
                                      if (e.target.checked) {
                                        newSelected.add(category.id);
                                        
                                        // Auto-select parent if it's in the CSV
                                        if (category.parentName) {
                                          const parentInCsv = categoryImportModal.csvData.find(
                                            cat => cat.name.toLowerCase() === category.parentName!.toLowerCase()
                                          );
                                          if (parentInCsv) {
                                            newSelected.add(parentInCsv.id);
                                          }
                                        }
                                      } else {
                                        newSelected.delete(category.id);
                                        
                                        // Auto-deselect children if this is a parent
                                        const childrenInCsv = categoryImportModal.csvData.filter(
                                          cat => cat.parentName && cat.parentName.toLowerCase() === category.name.toLowerCase()
                                        );
                                        childrenInCsv.forEach(child => {
                                          newSelected.delete(child.id);
                                        });
                                      }
                                      setCategoryImportModal((prev) => ({
                                        ...prev,
                                        selectedCategories: newSelected,
                                      }));
                                    }}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{category.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{category.type}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {category.parentName || "-"}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  {!category.isValid ? (
                                    <div className="flex items-center space-x-1">
                                      <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                                      <span className="text-red-700 text-xs">{category.validationMessage}</span>
                                    </div>
                                  ) : category.needsParentCreation ? (
                                    categoryImportModal.autoCreateMissing ? (
                                      <div className="flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                        <span className="text-blue-700 text-xs">Will create parent</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                                        <span className="text-orange-700 text-xs">Missing parent</span>
                                      </div>
                                    )
                                  ) : (
                                    <div className="flex items-center space-x-1">
                                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                      <span className="text-green-700 text-xs">Valid</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-medium">
                        {categoryImportModal.selectedCategories.size > 0 && (
                          <>
                            <span className="text-gray-600">
                              {categoryImportModal.selectedCategories.size} selected
                            </span>
                            {!categoryImportModal.autoCreateMissing &&
                              (() => {
                                const selectedCategories = categoryImportModal.csvData.filter((cat) =>
                                  categoryImportModal.selectedCategories.has(cat.id)
                                );
                                const validCount = selectedCategories.filter((cat) => cat.isValid && !cat.needsParentCreation).length;
                                const invalidCount = selectedCategories.filter((cat) => !cat.isValid || cat.needsParentCreation).length;

                                return invalidCount > 0 ? (
                                  <span className="text-red-600 ml-2">
                                    ({validCount} will import, {invalidCount} will skip)
                                  </span>
                                ) : null;
                              })()}
                          </>
                        )}
                      </div>
                      <div className="flex justify-end space-x-2 mt-4">
                        <button
                          onClick={() =>
                            setCategoryImportModal((prev) => ({
                              ...prev,
                              step: "upload",
                            }))
                          }
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            setCategoryImportModal((prev) => ({
                              ...prev,
                              isLoading: true,
                              error: null,
                            }));
                            try {
                              if (!currentCompany) {
                                throw new Error("No company selected. Please select a company first.");
                              }

                              const selectedCategories = categoryImportModal.csvData.filter((cat) =>
                                categoryImportModal.selectedCategories.has(cat.id)
                              );

                              if (selectedCategories.length === 0) {
                                throw new Error("No categories selected for import.");
                              }

                              // Check for parent dependencies
                              const dependencyCheck = validateParentDependencies(
                                categoryImportModal.csvData, 
                                categoryImportModal.selectedCategories
                              );
                              
                              if (!dependencyCheck.isValid) {
                                throw new Error(
                                  `Cannot import: The following parent categories are in the CSV but not selected: ${dependencyCheck.missingParents.join(", ")}. Please select them or deselect their children.`
                                );
                              }

                              // If auto-create is enabled, create missing parent categories first
                              if (categoryImportModal.autoCreateMissing) {
                                const missingParents = new Set<string>();

                                selectedCategories.forEach((cat) => {
                                  if (cat.needsParentCreation && cat.parentName) {
                                    missingParents.add(cat.parentName);
                                  }
                                });

                                // Create missing parent categories with same type as child
                                if (missingParents.size > 0) {
                                  const parentsToCreate = Array.from(missingParents).map((parentName) => {
                                    // Find a child category to get the type
                                    const childWithThisParent = selectedCategories.find(
                                      (cat) => cat.parentName === parentName
                                    );
                                    return {
                                      name: parentName,
                                      type: childWithThisParent?.type || "Expense", // Default to Expense if can't determine
                                      parent_id: null, // These are parent categories
                                      company_id: currentCompany.id,
                                    };
                                  });

                                  const { error: parentError } = await supabase
                                    .from("chart_of_accounts")
                                    .insert(parentsToCreate);

                                  if (parentError) {
                                    throw new Error(`Failed to create parent categories: ${parentError.message}`);
                                  }

                                  // Refresh accounts list to get the newly created parents
                                  await refreshCategories();
                                }
                              } else {
                                // If not auto-creating, filter out categories that need parent creation or are invalid
                                const validCategories = selectedCategories.filter((cat) => cat.isValid && !cat.needsParentCreation);
                                const invalidCategories = selectedCategories.filter((cat) => !cat.isValid || cat.needsParentCreation);

                                if (invalidCategories.length > 0 && validCategories.length > 0) {
                                  // Mixed selection - show confirmation
                                  const proceed = window.confirm(
                                    `${invalidCategories.length} selected categor${invalidCategories.length === 1 ? 'y' : 'ies'} reference missing parents or have validation errors and will be skipped.\n\n` +
                                      `Only ${validCategories.length} valid categor${validCategories.length === 1 ? 'y' : 'ies'} will be imported.\n\n` +
                                      `Click OK to proceed with valid categories only, or Cancel to go back and enable auto-creation.`
                                  );

                                  if (!proceed) {
                                    // User cancelled, stop the import process
                                    setCategoryImportModal((prev) => ({
                                      ...prev,
                                      isLoading: false,
                                    }));
                                    return;
                                  }
                                } else if (validCategories.length === 0) {
                                  // All selected categories are invalid
                                  throw new Error(
                                    "All selected categories reference missing parents or have validation errors. Enable 'Auto-create missing parents' or select only valid categories."
                                  );
                                }

                                // Update selectedCategories to only include valid ones
                                selectedCategories.splice(0, selectedCategories.length, ...validCategories);
                              }

                              // Sort categories to import parents before children
                              const sortCategoriesByDependency = (categories: CategoryImportData[]): CategoryImportData[] => {
                                const sorted: CategoryImportData[] = [];
                                const remaining = [...categories];
                                const processing = new Set<string>();

                                const addCategory = (cat: CategoryImportData) => {
                                  if (processing.has(cat.id)) return; // Avoid circular dependencies
                                  processing.add(cat.id);

                                  // If category has a parent in the import list, add parent first
                                  if (cat.parentName) {
                                    const parentInImport = remaining.find(
                                      c => c.name.toLowerCase() === cat.parentName!.toLowerCase() && c.id !== cat.id
                                    );
                                    if (parentInImport && !sorted.includes(parentInImport)) {
                                      addCategory(parentInImport);
                                    }
                                  }

                                  // Add this category if not already added
                                  if (!sorted.includes(cat)) {
                                    sorted.push(cat);
                                  }
                                  processing.delete(cat.id);
                                };

                                // Add all categories, respecting dependencies
                                for (const cat of remaining) {
                                  addCategory(cat);
                                }

                                return sorted;
                              };

                              const orderedCategories = sortCategoriesByDependency(selectedCategories);

                              // Split categories into parents and children for two-phase import
                              const parentCategories = orderedCategories.filter(cat => !cat.parentName);
                              const childCategories = orderedCategories.filter(cat => cat.parentName);

                              // Phase 1: Import parent categories first
                              if (parentCategories.length > 0) {
                                const parentCategoriesToInsert = parentCategories.map((cat) => ({
                                  name: cat.name,
                                  type: cat.type,
                                  parent_id: null, // Parents have no parent
                                  company_id: currentCompany.id,
                                }));

                                const { error: parentError } = await supabase.from("chart_of_accounts").insert(parentCategoriesToInsert);
                                if (parentError) {
                                  throw new Error(`Failed to import parent categories: ${parentError.message}`);
                                }

                                // Refresh accounts list to get newly created parents
                                await refreshCategories();
                              }

                              // Phase 2: Import child categories with proper parent_id resolution
                              if (childCategories.length > 0) {
                                const childCategoriesToInsert = await Promise.all(
                                  childCategories.map(async (cat) => {
                                    let parent_id = cat.parent_id;
                                    
                                    // If we have a parentName but no parent_id, look it up (including newly created parents)
                                    if (cat.parentName && !parent_id) {
                                      // Get fresh accounts list that includes newly created parents
                                      const { data: freshAccounts } = await supabase
                                        .from("chart_of_accounts")
                                        .select("*")
                                        .eq("company_id", currentCompany.id);
                                      
                                      if (freshAccounts) {
                                        const parentAccount = freshAccounts.find((acc) => acc.name.toLowerCase() === cat.parentName!.toLowerCase());
                                        parent_id = parentAccount?.id || null;
                                      }
                                    }

                                    return {
                                      name: cat.name,
                                      type: cat.type,
                                      parent_id,
                                      company_id: currentCompany.id,
                                    };
                                  })
                                );

                                const { error: childError } = await supabase.from("chart_of_accounts").insert(childCategoriesToInsert);
                                if (childError) {
                                  throw new Error(`Failed to import child categories: ${childError.message}`);
                                }
                              }

                              setCategoryImportModal({
                                isOpen: false,
                                step: "upload",
                                csvData: [],
                                isLoading: false,
                                error: null,
                                selectedCategories: new Set(),
                                autoCreateMissing: false,
                              });

                              await fetchParentOptions();
                            } catch (error) {
                              setCategoryImportModal((prev) => ({
                                ...prev,
                                isLoading: false,
                                error:
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to import categories. Please try again.",
                              }));
                            }
                          }}
                          className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Import Categories
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
