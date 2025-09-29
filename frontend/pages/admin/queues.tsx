import Head from 'next/head';import NavBar from '../../components/NavBar';
import { useEffect, useMemo, useRef, useState } from 'react';import { useRequireAuth } from '../../utils/guards';
import api from '../../utils/api';
type QueueDef = { name