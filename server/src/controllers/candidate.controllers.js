import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET all candidates (no ID, no token needed)
export const getCandidates = async (req, res) => {
  try {
    const candidates = await prisma.candidate.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ success: true, data: candidates });
  } catch (err) {
    console.error("Error fetching candidates:", err);
    res.status(500).json({ success: false, message: "Failed to fetch candidates" });
  }
};

// DELETE candidate by ID (still requires an ID)
export const deleteCandidate = async (req, res) => {
  const { id } = req.params;
  try {
    const candidate = await prisma.candidate.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ success: true, message: "Candidate deleted", data: candidate });
  } catch (err) {
    console.error("Error deleting candidate:", err);
    res.status(500).json({ success: false, message: "Failed to delete candidate" });
  }
};
