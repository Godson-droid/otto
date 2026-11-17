"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isHex } from "viem";
import { useAccount } from "wagmi";
import { PayInvoice } from "@/components/PayInvoice";
import { Notice } from "@/components/ui";
import { useNetwork } from "@/lib/network";
import { loadRequests, parsePayLink, type PaymentRequest } from "@/lib/otto";

export default function InvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const search = useSearchParams();
  const { net } = useNetwork();
  const { address } = useAccount();
  const invoiceId = params.invoiceId;
  const validId = isHex(invoiceId) && invoiceId.length === 66;

  const [request, setRequest] = useState<PaymentRequest | null | undefined>(undefined);

  useEffect(() => {
    if (!validId) {
      setRequest(null);
      return;
    }
    const fromLink = parsePayLink(invoiceId, search.get("d"));
    if (fromLink) {
      setRequest(fromLink);
      return;
    }
    // No link data: the request may be in this browser's own request book.
    if (address) {
      const mine = loadRequests(net.chain.id, address).find((r) => r.invoiceId.toLowerCase() === invoiceId.toLowerCase());
      if (mine) {
        setRequest(mine);
        return;
      }
    }
    setRequest(null);
  }, [invoiceId, search, address, net.chain.id, validId]);

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1 className="text-heading-page">Payment request</h1>
          <p className="page-sub">Someone is asking you to pay an exact amount in tUSD8. The amount is locked by the seller&apos;s signature and cannot be changed.</p>
        </div>
      </div>

      {!validId || request === null ? (
        <Notice tone="error" title="This payment link is not complete">
          The link is missing the request details, or they did not pass the format checks. Ask the seller to send the full link again.
          Nothing has been charged. <Link href="/pay">Pay an address directly instead</Link>.
        </Notice>
      ) : request === undefined ? (
        <p className="fine cluster" style={{ gap: 8 }}>
          <span className="spinner" aria-hidden="true" /> Reading the request…
        </p>
      ) : (
        <PayInvoice request={request} />
      )}
    </main>
  );
}
