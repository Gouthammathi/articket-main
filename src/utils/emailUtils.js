import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
 
// NOTE: The 'project' field in user documents should always be an array of project names, even if the user is in only one project (e.g., ['VMM']).
export const fetchProjectMemberEmails = async (projectName) => {
  if (!projectName) return [];
  try {
    const usersRef = collection(db, 'users');
    // Use 'array-contains' to match users in multiple projects
    const q = query(usersRef, where('project', 'array-contains', projectName));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data().email).filter(Boolean);
  } catch (error) {
    console.error("Error fetching project member emails:", error);
    return [];
  }
};
 
 