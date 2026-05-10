import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { userId } = await auth()

    if (!userId) {
        redirect('/login')
    }

    return (
        <>
            <Navbar />
            {children}
        </>
    )
}