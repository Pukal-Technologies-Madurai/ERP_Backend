const processedRequests = new Set()

export const idempotencyValidator = (req, res, next) => {

    const key = req.headers["idempotency-key"]

    if (!key) return next()

    if (processedRequests.has(key)) {
        return res.status(409).json({
            success: false,
            message: "Duplicate request",
            data: [],
            others: {}
        })
    }

    processedRequests.add(key)

    next()
}