import {PrismaClient} from '@prisma/client'
import { NODE_ENV } from "../credentials.js"

const globalForPrisma = globalThis

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (NODE_ENV!== 'production') globalForPrisma.prisma = prisma