-- Correct the full-page copyright disclaimer wording to match each publisher's
-- current required notice text, add the missing AMPC (Amplified Bible, Classic
-- Edition) notice used throughout existing teaching/devotional content, and
-- turn the Lockman Foundation reference into a real https:// URL so it
-- auto-links via the existing bare-URL renderer.

update public.copyright_disclaimers
set content = 'Scripture quotations taken from The Holy Bible, New International Version®, NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission. All rights reserved worldwide.

Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

Scripture quotations taken from the Amplified® Bible (AMP), Copyright © 2015 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture quotations marked (AMPC) taken from the Amplified® Bible, Classic Edition, Copyright © 1954, 1958, 1962, 1964, 1965, 1987 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.

Original commentary, organization, editorial content, and presentation © 2026 The Prayer Whiteboard. All rights reserved. Scripture quotations and any underlying third-party teaching material remain the property of their respective copyright holders.'
where disclaimer_key = 'full_page';
