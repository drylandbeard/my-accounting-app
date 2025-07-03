"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Account, Transaction } from "../_types";

interface UseFinancialDataProps {
  companyId: string | null;
  startDate: string;
  endDate: string;
  accountTypes: string[];
}

interface UseFinancialDataReturn {
  accounts: Account[];
  journalEntries: Transaction[];
  loading: boolean;
}

export const useFinancialData = ({
  companyId,
  startDate,
  endDate,
  accountTypes,
}: UseFinancialDataProps): UseFinancialDataReturn => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId || !startDate || !endDate) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Fetch accounts
        const { data: accountsData } = await supabase
          .from("chart_of_accounts")
          .select("*")
          .eq("company_id", companyId)
          .in("type", accountTypes);

        setAccounts(accountsData || []);

        // Fetch ALL journal entries with pagination to handle more than 1000 rows
        let allJournalData: Array<{
          id: string;
          date: string;
          description: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          transaction_id: string;
          company_id: string;
        }> = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        // Base query
        let baseQuery = supabase.from("journal").select("*").eq("company_id", companyId);

        // Add date range if provided
        if (startDate && endDate) {
          baseQuery = baseQuery.gte("date", startDate).lte("date", endDate);
        }

        // Fetch all pages of data
        while (hasMore) {
          const { data: journalData, error } = await baseQuery
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order("date", { ascending: true });

          if (error) {
            console.error("Error fetching journal data:", error);
            break;
          }

          if (journalData && journalData.length > 0) {
            allJournalData = [...allJournalData, ...journalData];
            page++;
            hasMore = journalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        console.log(`Total journal entries fetched: ${allJournalData.length}`);

        // Fetch manual journal entries with pagination
        let allManualJournalData: Array<{
          id: string;
          date: string;
          description?: string;
          je_name?: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          reference_number?: string;
          company_id: string;
        }> = [];
        page = 0;
        hasMore = true;

        // Base query for manual entries
        let baseManualQuery = supabase.from("manual_journal_entries").select("*").eq("company_id", companyId);

        // Add date range if provided
        if (startDate && endDate) {
          baseManualQuery = baseManualQuery.gte("date", startDate).lte("date", endDate);
        }

        // Fetch all pages of manual journal data
        while (hasMore) {
          const { data: manualJournalData, error } = await baseManualQuery
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order("date", { ascending: true });

          if (error) {
            console.error("Error fetching manual journal data:", error);
            break;
          }

          if (manualJournalData && manualJournalData.length > 0) {
            allManualJournalData = [...allManualJournalData, ...manualJournalData];
            page++;
            hasMore = manualJournalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        console.log(`Total manual journal entries fetched: ${allManualJournalData.length}`);

        // Transform and combine both datasets
        const regularEntries: Transaction[] = allJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description,
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.transaction_id,
          source: "journal" as const,
        }));

        const manualEntries: Transaction[] = allManualJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description || entry.je_name || "Manual Entry",
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.reference_number || entry.id,
          source: "manual" as const,
        }));

        // Combine all entries
        const allEntries = [...regularEntries, ...manualEntries];
        setJournalEntries(allEntries);
      } catch (error) {
        console.error("Error fetching financial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, startDate, endDate, accountTypes]);

  return { accounts, journalEntries, loading };
};
