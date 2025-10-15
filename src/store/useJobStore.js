import { createStore } from "zustand/vanilla";

const sampleJob = {
  id: "job_001",
  title: "Carpenter",
  company: "WoodWorks Pvt. Ltd.",
  location: "Hyderabad, India",
  jobType: "FULL_TIME",
  experience: "1+ years",
  salaryRange: "₹15k - ₹20k / month",
  description: "Skilled carpenter needed for furniture making and repairs.",
  requirements: ["Basic carpentry skills", "Use of hand & power tools"],
  responsibilities: ["Make & repair furniture", "Assist in installations"],
  perks: ["Overtime pay"],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const useJobStore = createStore((set) => ({
  jobs: [sampleJob],
  addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
  removeJob: (id) =>
    set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
  toggleJobStatus: (id) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, isActive: !job.isActive } : job
      ),
    })),
}));
