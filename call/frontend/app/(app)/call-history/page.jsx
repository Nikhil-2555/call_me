"use client"
import React from 'react'
import { DataTable } from "@/components/data-table"
import data from "../dashboard/data.json"


const page = () => {
  return (
    <div className="py-7">
      <DataTable data={data} />
    </div>
  )
}

export default page
