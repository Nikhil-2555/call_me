import React from 'react';

// Import your icon libraries or components if needed
import { IconSettings } from "@tabler/icons-react";

// Define your component
const WorkspaceHeader = () => {
  return (
    <div className="p-4 ">
      <div className="flex items-center space-x-4">
        <div className="flex text-sm items-center space-x-2 border-1  p-4 rounded-full">
          <span className="bg-transparent">●</span>
          <span className="text-lg font-semibold">Active calls: 0</span>
        </div>
      </div>
       <div>
        <div className="text-6xl mt-10 font-bold">
          My Workspace
   
          <br />
        <h2 className='text-xl mt-2'>  Good morning, Naruto </h2>
        </div>
       </div>
    </div>
  );
};

export default WorkspaceHeader;