import axiosClient from "@/axiosClient"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, MoreVertical, StopCircle, Undo, User } from "lucide-react"
import { useEffect, useState } from "react"
import { useLoaderData } from "react-router-dom"
import { toast } from "react-toastify"
import UserPagination from "./components/UserPagination"
import UserModal from "./components/UserModal"
import DeleteUserModal from "./components/DeleteUserModal"

export async function loader() {
  const res = await axiosClient.get("/users/users")
  return res.data
}

export default function Users() {
  const initialData = useLoaderData()
  const [data, setData] = useState(initialData) //mapping the data
  const [search, setSearch] = useState("") //search filter
  const [filter, setFilter] = useState("latest") //filters
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false) //loading state
  const [currentPage, setCurrentPage] = useState(1) //pagination
  const [modal, setModal] = useState({
    user: null,
    open: false,
  })
  const [deleteModal, setDeleteModal] = useState({
    id: null,
    open: false,
  })
  //function to fetch filtered data
  const fetchUsers = async (
    searchTerm = "",
    sortBy = "",
    status = "",
    page = 1
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append("search", searchTerm)
      if (sortBy) params.append("sort", sortBy)
      if (status) params.append("status", status)
      params.append("page", page.toString())
      const res = await axiosClient.get(`/users/users?${params.toString()}`)
      setData(res.data)
    } catch (error) {
      toast.error(`Error fetching users`, error)
    } finally {
      setLoading(false)
    }
  }
  //Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchUsers(search, filter, status, currentPage)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [search, filter, status, currentPage])

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [search, status, filter])

  const userFilters = [
    { value: "latest", label: "Latest" },
    { value: "oldest", label: "Oldest" },
  ]

  const statusFilters = [
    { value: null, label: "All" },
    { value: "User", label: "User" },
    { value: "Customer", label: "Customer" },
  ]

  const blockUser = async (id) => {
    try {
      await axiosClient.patch(`/users/${id}/block`)
      toast.success("User blocked successfully!")
      fetchUsers(search, filter, status, currentPage)
    } catch (error) {
      toast.error("Something went wrong!")
    }
  }

  const unblockUser = async (id) => {
    try {
      await axiosClient.patch(`/users/${id}/unblock`)
      toast.success("User unblocked successfully!")
      fetchUsers(search, filter, status, currentPage)
    } catch (error) {
      toast.error("Something went wrong!")
    }
  }

  return (
    <>
      <main className="flex-1 p-10 border-t bg-gray-100/50 flex flex-col gap-10">
        <section className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl flex items-center gap-2 font-bold">
            <User />
            Users
          </h1>
        </section>
        <section className="flex-1 flex flex-col">
          <div className="flex items-center gap-5 max-[470px]:flex-col max-[470px]:items-start">
            <div className="flex flex-col">
              <label htmlFor="search">Search:</label>
              <input
                type="text"
                placeholder="Enter search..."
                className="border-1 border-black rounded-md bg-white py-1 px-2 "
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="filter">Filter:</label>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="py-1 px-2 border-1 border-black rounded-md">
                  <SelectValue placeholder="Select a filter..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Filters</SelectLabel>
                    {userFilters.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col">
              <label htmlFor="filter">Status:</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="py-1 px-2 border-1 border-black rounded-md">
                  <SelectValue placeholder="Select a filter..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Filters</SelectLabel>
                    {statusFilters.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex-1 flex flex-col">
            <Table className="mt-5">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="max-[470px]:hidden">Email</TableHead>
                  <TableHead className="max-[900px]:hidden">Phone</TableHead>
                  <TableHead className="max-[540px]:hidden">Status</TableHead>
                  <TableHead>Blocked</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      <Loader2 className="animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data?.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium max-w-sm truncate">
                        {d.name}
                      </TableCell>
                      <TableCell className="max-[470px]:hidden">
                        {d.email}
                      </TableCell>
                      <TableCell className="max-[900px]:hidden">
                        {d.phone ? d.phone : "N/A"}
                      </TableCell>
                      <TableCell className="max-[540px]:hidden">
                        {d.status}
                      </TableCell>
                      <TableCell>{d.blocked ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <MoreVertical className="cursor-pointer" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {!d.blocked ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  blockUser(d.id)
                                }}
                                className="cursor-pointer"
                              >
                                <StopCircle />
                                Block User?
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => {
                                  unblockUser(d.id)
                                }}
                                className="cursor-pointer"
                              >
                                <Undo />
                                UnBlock User?
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setModal((prev) => ({
                                  ...prev,
                                  open: true,
                                  user: d,
                                }))
                              }}
                              className="cursor-pointer flex items-center justify-center"
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setDeleteModal((prev) => ({
                                  ...prev,
                                  open: true,
                                  id: d.id,
                                }))
                              }}
                              className="cursor-pointer flex items-center justify-center"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-5 w-full">
              <p className="italic">
                Showing {data.data?.length || 0} of {data.count || 0} results
              </p>

              {data.totalPages > 1 && (
                <div>
                  <UserPagination
                    data={data}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      {modal.open && (
        <UserModal setModal={setModal} fetchUsers={fetchUsers} modal={modal} />
      )}
      {deleteModal.open && (
        <DeleteUserModal
          setDeleteModal={setDeleteModal}
          deleteModal={deleteModal}
          fetchUsers={fetchUsers}
        />
      )}
    </>
  )
}