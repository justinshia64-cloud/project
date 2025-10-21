import { prisma } from "../server.js"
export async function getJobs(req, res) {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sort = "latest",
      stage = "", // Filter by job stage
    } = req.query

    const pageNumber = parseInt(page)
    const pageSize = parseInt(limit)
    const skip = (pageNumber - 1) * pageSize

    // Base where clause based on user role
    let baseWhere = {}
    if (req.user.role === "CUSTOMER") {
      // Customer sees jobs from their own bookings
      baseWhere = {
        booking: {
          customerId: req.user.userId,
        },
      }
    } else if (req.user.role === "TECHNICIAN") {
      // Technician should see jobs where they are assigned either as primary technician
      // (booking.technicianId) or via the bookingTechnicians join table (many-to-many)
      baseWhere = {
        booking: {
          OR: [
            { technicianId: req.user.userId },
            { bookingTechnicians: { some: { technicianId: req.user.userId } } },
          ],
        },
      }
    }
    // ADMIN sees all jobs (no additional filter)

    // Search filters - search across related booking data
    let searchWhere = {}
    if (search) {
      searchWhere = {
        OR: [
          { booking: { car: { plateNo: { contains: search } } } },
          { booking: { car: { brand: { contains: search } } } },
          { booking: { car: { model: { contains: search } } } },
          { booking: { service: { name: { contains: search } } } },
          { booking: { customer: { name: { contains: search } } } },
          { notes: { some: { content: { contains: search } } } },
        ],
      }
    }

    // Stage filter
    let stageWhere = {}
    if (stage !== null && stage !== "" && stage !== "undefined") {
      stageWhere.stage = stage
    }

    // Combine all where conditions
    const where = {
      ...baseWhere,
      ...searchWhere,
      ...stageWhere,
    }

    // Sort options
    let orderBy
    switch (sort) {
      case "latest":
        orderBy = { updatedAt: "desc" }
        break
      case "oldest":
        orderBy = { updatedAt: "asc" }
        break
      case "stage_asc":
        orderBy = { stage: "asc" }
        break
      default:
        orderBy = { updatedAt: "desc" }
    }

    const [jobs, count] = await prisma.$transaction([
      prisma.job.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          booking: {
            include: {
              car: true,
              service: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              technician: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              bookingTechnicians: {
                include: { technician: { select: { id: true, name: true, email: true } } },
              },
            },
          },
          notes: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 5, // Limit recent notes
          },
          partsUsed: {
            include: {
              part: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ])

    res.status(200).json({
      data: jobs,
      count,
      page: pageNumber,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "Something went wrong" })
  }
}

// Helper: check if a user is assigned to the job (primary technician or via bookingTechnicians)
async function isUserAssignedToJob(userId, jobId) {
  const job = await prisma.job.findUnique({
    where: { id: parseInt(jobId) },
    include: { booking: { include: { bookingTechnicians: { select: { technicianId: true } }, technician: true } } },
  })
  if (!job) return false
  if (job.booking?.technicianId === userId) return true
  const assigned = (job.booking?.bookingTechnicians || []).some((b) => b.technicianId === userId)
  return assigned
}

export async function updateJobStage(req, res) {
  try {
    const { id } = req.params
    const { stage } = req.body

    if (stage === "COMPLETION") {
      return res
        .status(400)
        .json({ error: "Cannot update stage to COMPLETION" })
    }

    // Authorization: only assigned technicians or admins can update stage
    if (req.user.role !== 'ADMIN') {
      const allowed = await isUserAssignedToJob(req.user.userId, id)
      if (!allowed) return res.status(403).json({ error: 'Not authorized to update this job' })
    }

    const job = await prisma.job.update({
      where: { id: parseInt(id) },
      data: { stage },
      include: { booking: { include: { bookingTechnicians: { include: { technician: true } }, technician: true, customer: true } } }
    })

    // Notify assigned technicians (except actor) about stage change
    try {
      const actorId = req.user.userId
      const techIds = []
      if (job.booking?.technician) techIds.push(job.booking.technician.id)
      if (job.booking?.bookingTechnicians) {
        for (const bt of job.booking.bookingTechnicians) {
          if (bt.technician && !techIds.includes(bt.technician.id)) techIds.push(bt.technician.id)
        }
      }
      const notifications = techIds
        .filter((t) => t !== actorId)
        .map((t) => ({
          userId: t,
          title: `Job #${job.id} updated`,
          message: `Job #${job.id} status changed to ${stage}`,
          meta: { jobId: job.id },
          read: false,
        }))
      if (notifications.length > 0) await prisma.notification.createMany({ data: notifications })
    } catch (e) {
      console.error('Failed to notify technicians about stage change', e)
    }

    res.status(200).json({ message: "Job stage updated successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Something went wrong" })
  }
}

export async function addJobNote(req, res) {
  try {
    const { id } = req.params
    const { content } = req.body

    // Authorization: only assigned technicians or admins or the booking customer can add notes
    if (req.user.role !== 'ADMIN') {
      const allowedTech = await isUserAssignedToJob(req.user.userId, id)
      // allow customers who own the booking to add notes as well
      let isCustomerOwner = false
      if (!allowedTech) {
        const job = await prisma.job.findUnique({ where: { id: parseInt(id) }, include: { booking: true } })
        if (job && job.booking?.customerId === req.user.userId) isCustomerOwner = true
      }
      if (!allowedTech && !isCustomerOwner) return res.status(403).json({ error: 'Not authorized to add notes to this job' })
    }

    const jobNote = await prisma.jobNote.create({
      data: {
        content,
        authorId: req.user.userId,
        jobId: parseInt(id),
      },
    })

    // Notify other assigned technicians (except author)
    try {
      const jobWithBooking = await prisma.job.findUnique({ where: { id: parseInt(id) }, include: { booking: { include: { bookingTechnicians: { select: { technicianId: true } }, technician: true } } } })
      const actorId = req.user.userId
      const techIds = []
      if (jobWithBooking.booking?.technician) techIds.push(jobWithBooking.booking.technician.id)
      if (jobWithBooking.booking?.bookingTechnicians) {
        for (const bt of jobWithBooking.booking.bookingTechnicians) {
          if (!techIds.includes(bt.technicianId)) techIds.push(bt.technicianId)
        }
      }
      const notifications = techIds.filter(t => t !== actorId).map(t => ({
        userId: t,
        title: `New note on job #${id}`,
        message: `A new note was added to job #${id}`,
        meta: { jobId: parseInt(id), noteId: jobNote.id },
        read: false,
      }))
      if (notifications.length > 0) await prisma.notification.createMany({ data: notifications })
    } catch (e) {
      console.error('Failed to notify technicians about new job note', e)
    }

    res.status(200).json({ message: "Note added successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Something went wrong" })
  }
}

export async function completeJob(req, res) {
  const { id } = req.params
  const { parts = [] } = req.body

  try {
    // Authorization: only assigned technicians or admins can complete the job
    if (req.user.role !== 'ADMIN') {
      const allowed = await isUserAssignedToJob(req.user.userId, id)
      if (!allowed) return res.status(403).json({ error: 'Not authorized to complete this job' })
    }
    await prisma.$transaction(async (tx) => {
      // 1. Validate parts stock and decrement
      for (const item of parts) {
        const part = await tx.part.findUnique({
          where: { id: item.partId },
        })

        if (!part) {
          throw new Error(`Part with ID ${item.partId} not found`)
        }

        if (part.stock < item.quantity) {
          throw new Error(
            `Not enough stock for ${part.name}. Available: ${part.stock}, requested: ${item.quantity}`
          )
        }

        // Decrement stock
        await tx.part.update({
          where: { id: item.partId },
          data: { stock: { decrement: item.quantity } },
        })

        // Log stock out
        await tx.inventoryLog.create({
          data: {
            partId: item.partId,
            quantity: item.quantity,
            type: "OUT",
          },
        })

        // Record parts used for this job ✅
        await tx.partsUsed.create({
          data: {
            jobId: parseInt(id),
            partId: item.partId,
            quantity: item.quantity,
          },
        })
      }

      // 2. Update job status to COMPLETED
        await tx.job.update({
          where: { id: parseInt(id) },
          data: {
            stage: "COMPLETION",
          },
        })

        // After completing the job, mark assigned technicians available again
        // if they no longer have any other active jobs (stage != COMPLETION)
        const jobWithBooking = await tx.job.findUnique({
          where: { id: parseInt(id) },
          include: { booking: { include: { bookingTechnicians: { select: { technicianId: true } } } } },
        })

        const techIds = (jobWithBooking.booking.bookingTechnicians || []).map((b) => b.technicianId)
        for (const techId of techIds) {
          // Look for any other active job where this technician is assigned via bookingTechnicians
          const active = await tx.job.findFirst({
            where: {
              stage: { not: "COMPLETION" },
              id: { not: parseInt(id) },
              booking: {
                bookingTechnicians: {
                  some: { technicianId: techId },
                },
              },
            },
          })

          if (!active) {
            await tx.user.update({ where: { id: techId }, data: { available: true } })
          }
        }
        // Notify all assigned technicians about completion
        try {
          const notifications = techIds.map((t) => ({
            userId: t,
            title: `Job #${id} completed`,
            message: `Job #${id} has been marked as completed.`,
            meta: { jobId: parseInt(id) },
            read: false,
          }))
          if (notifications.length > 0) await tx.notification.createMany({ data: notifications })
        } catch (e) {
          console.error('Failed to create completion notifications', e)
        }
    })

    res.status(200).json({ message: "Job completed successfully!" })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}