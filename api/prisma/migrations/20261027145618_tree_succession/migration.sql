-- AlterTable
ALTER TABLE "Tree" ADD COLUMN     "ownershipTransferredAt" TIMESTAMP(3),
ADD COLUMN     "previousOwnerId" TEXT,
ADD COLUMN     "successorNominatedAt" TIMESTAMP(3);
