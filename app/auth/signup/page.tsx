'use client'

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-700 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">⛵ RacePrep</h1>
          <p className="text-gray-600 mt-2">Request Crew Access</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-gray-700 mb-4">
            This app is currently invite-only for crew members.
          </p>
          <p className="text-gray-700 mb-4">
            To request access, please contact your skipper or send an email with:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
            <li>Your name</li>
            <li>Role on the boat (tactician, trimmer, crew, etc.)</li>
            <li>Email address</li>
          </ul>
          <p className="text-sm text-gray-500">
            This keeps our race strategy private from competitors.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-blue-600 hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
