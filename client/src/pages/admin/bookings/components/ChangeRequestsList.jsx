import React, { useEffect, useState } from "react"
import axiosClient from "@/axiosClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime, formatCurrency } from "@/lib/formatter"
import { toast } from "react-toastify"
import ConfirmDialog from '@/components/ConfirmDialog'
import { useCallback } from 'react'

export default function ChangeRequestsList() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await axiosClient.get("/bookings/change-requests")
      setRequests(res.data.data)
    } catch (err) {
      toast.error("Failed to load change requests")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const approve = async (bookingId, id) => {
    setDialog({ open: true, type: 'approve', bookingId, id, message: `Approve change request ${id} for booking ${bookingId}? This will update the booking date/time.` })
  }

  const doApprove = async ({ bookingId, id }) => {
    try {
      const res = await axiosClient.patch(`/bookings/${bookingId}/change-request/approve`, { changeRequestId: id })
      toast.success("Approved")
      // If server returned updated booking, dispatch a global event so other parts of the app can refresh
      if (res.data && res.data.data) {
        try {
          window.dispatchEvent(new CustomEvent('booking-updated', { detail: res.data.data }))
        } catch (e) {
          // ignore environments that don't support CustomEvent constructor
          const ev = document.createEvent('CustomEvent')
          ev.initCustomEvent('booking-updated', true, true, res.data.data)
          window.dispatchEvent(ev)
        }
      }
      // refresh change requests list
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.message || err.message)
    }
  }

  const reject = async (id) => {
    setDialog({ open: true, type: 'reject', id, message: `Reject change request ${id}? The booking will remain unchanged.` })
  }

  const doReject = async ({ id }) => {
    try {
      await axiosClient.patch(`/bookings/change-requests/${id}/reject`)
      toast.success("Rejected")
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.message || err.message)
    }
  }

  const [dialog, setDialog] = useState({ open: false, type: null, id: null, bookingId: null, message: '' })

  const onConfirmDialog = useCallback(() => {
    if (!dialog.open) return
    const payload = { id: dialog.id, bookingId: dialog.bookingId }
    if (dialog.type === 'approve') doApprove(payload)
    if (dialog.type === 'reject') doReject(payload)
    setDialog({ open: false, type: null, id: null, bookingId: null, message: '' })
  }, [dialog])

  const onCancelDialog = useCallback(() => setDialog({ open: false, type: null, id: null, bookingId: null, message: '' }), [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pending Change Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {!loading && requests.filter(r => r.status === 'PENDING').length === 0 && <p>No pending change requests.</p>}
          <div className="space-y-3">
            {requests.filter(r => r.status === 'PENDING').map((r) => (
              <div key={r.id} className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-semibold">Booking #{r.bookingId} — {r.booking.customer?.name}</div>
                  <div className="text-sm text-gray-600">Requested: {formatDateTime(r.requestedAt)} by {r.requester?.name}</div>
                  {r.reason && <div className="text-sm text-gray-600">Reason: {r.reason}</div>}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approve(r.bookingId, r.id)}>Approve</Button>
                  <Button variant="destructive" onClick={() => reject(r.id)}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

        <ConfirmDialog open={dialog.open} title={dialog.type === 'approve' ? 'Approve Change Request' : 'Reject Change Request'} message={dialog.message} onConfirm={onConfirmDialog} onCancel={onCancelDialog} />

      <Card>
        <CardHeader>
          <CardTitle>Change Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {!loading && requests.filter(r => r.status !== 'PENDING').length === 0 && <p>No history yet.</p>}
          <div className="space-y-3">
            {requests.filter(r => r.status !== 'PENDING').map((r) => (
              <div key={r.id} className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-semibold">Booking #{r.bookingId} — {r.booking.customer?.name}</div>
                  <div className="text-sm text-gray-600">Requested: {formatDateTime(r.requestedAt)} by {r.requester?.name}</div>
                  <div className="text-sm text-gray-600">Status: <span className={r.status === 'APPROVED' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{r.status}</span></div>
                  {r.reason && <div className="text-sm text-gray-600">Reason: {r.reason}</div>}
                  <div className="text-xs text-gray-500 mt-1">Updated: {formatDateTime(r.updatedAt || r.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
