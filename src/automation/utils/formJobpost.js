// utils/formatJob.js
export function formatJobPost(job) {
  return `
**${job.title}**
${job.company}
${job.location}
${job.jobType.replace("_", " ")}
Experience: ${job.experience}
Salary: ${job.salaryRange}

Job Description:
${job.description.trim()}

Requirements:
${job.requirements.map((r) => `- ${r}`).join("\n")}

Responsibilities:
${job.responsibilities.map((r) => `- ${r}`).join("\n")}

Perks:
${job.perks.map((p) => `- ${p}`).join("\n")}

Posted on: ${job.createdAt.toDateString()}
`;
}
